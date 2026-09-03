import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getS3ConnectionToken } from 'nestjs-s3'
import { DataSource } from 'typeorm'
import { Job, WaitingChildrenError } from 'bullmq'
import { Readable } from 'node:stream'
import { Upload } from '@aws-sdk/lib-storage'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { EmailVerification } from '../sync-email-verification'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import {
    CustomerObjectWriteSecurityMapping,
    customerObjectWriteSecurityContract,
} from '@tuposoft/lead-email-finder/common/testing'

jest.mock('@aws-sdk/lib-storage')

interface UploadParams {
    Bucket: string
    Key: string
    Body: NodeJS.WritableStream
    CacheControl?: string
    ServerSideEncryption?: string
    SSEKMSKeyId?: string
}

const developmentObjectWriteSecurity: CustomerObjectWriteSecurity = {
    mode: 'development-local',
    cacheControl: 'no-store',
}

function readSecurityMapping(params: UploadParams): CustomerObjectWriteSecurityMapping {
    if ('ServerSideEncryption' in params || 'SSEKMSKeyId' in params) {
        return {
            cacheControl: params.CacheControl as 'no-store',
            serverSideEncryption: params.ServerSideEncryption as 'aws:kms',
            kmsKeyId: params.SSEKMSKeyId as string,
        }
    }

    return { cacheControl: params.CacheControl as 'no-store' }
}

function mockUploadDrivenByBody(
    onBody?: (body: NodeJS.WritableStream) => void,
    onUpload?: (params: UploadParams) => void,
): void {
    ;(Upload as unknown as jest.Mock).mockImplementation(({ params }: { params: UploadParams }) => {
        onUpload?.(params)
        onBody?.(params.Body)

        return {
            done: () =>
                new Promise((resolve, reject) => {
                    params.Body.on('finish', resolve)
                    params.Body.on('error', reject)
                }),
        }
    })
}

function mockUploadRejectingDirectly(error: Error): void {
    ;(Upload as unknown as jest.Mock).mockImplementation(() => ({
        done: () => Promise.reject(error),
    }))
}

function erroringCursor(error: Error): Readable {
    let emitted = false

    return new Readable({
        objectMode: true,
        read() {
            if (!emitted) {
                emitted = true
                process.nextTick(() => this.destroy(error))
            }
        },
    })
}

describe('BatchEmailVerificationProcessor', () => {
    let queryBuilder: { where: jest.Mock; andWhere: jest.Mock; stream: jest.Mock }
    let asyncEmailVerificationQueue: { add: jest.Mock }
    let s3: { getObject: jest.Mock }
    let job: Job<BatchEmailVerificationJobData, string> & { updateData: jest.Mock }

    beforeEach(() => {
        jest.clearAllMocks()

        queryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            stream: jest.fn(),
        }
        asyncEmailVerificationQueue = { add: jest.fn() }
        s3 = { getObject: jest.fn() }

        job = {
            id: 'job-1',
            queueQualifiedName: 'bull:batch-email-verification',
            data: {
                step: BatchEmailVerificationJobStep.UploadResults,
                bucket: 'bucket',
                key: 'organizations/org-1/uploads/file.csv',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            updateData: jest.fn((data: BatchEmailVerificationJobData) => {
                job.data = data
                return Promise.resolve()
            }),
        } as unknown as Job<BatchEmailVerificationJobData, string> & { updateData: jest.Mock }
    })

    async function buildProcessor(
        cursor: Readable,
        metadataColumns: { propertyName: string }[] = [{ propertyName: 'email' }],
        objectWriteSecurity: CustomerObjectWriteSecurity = developmentObjectWriteSecurity,
    ): Promise<BatchEmailVerificationProcessor> {
        queryBuilder.stream.mockResolvedValue(cursor)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BatchEmailVerificationProcessor,
                { provide: getS3ConnectionToken('default'), useValue: s3 },
                { provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, useValue: objectWriteSecurity },
                { provide: getQueueToken('async-email-verification'), useValue: asyncEmailVerificationQueue },
                {
                    provide: getRepositoryToken(EmailVerification),
                    useValue: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
                },
                {
                    provide: DataSource,
                    useValue: { getMetadata: jest.fn().mockReturnValue({ columns: metadataColumns }) },
                },
                { provide: CreditsService, useValue: { debit: jest.fn() } },
            ],
        }).compile()

        return module.get(BatchEmailVerificationProcessor)
    }

    customerObjectWriteSecurityContract('batch result AWS upload adapter', {
        writeWithSecurity: async security => {
            let uploadParams: UploadParams | undefined
            mockUploadDrivenByBody(undefined, params => {
                uploadParams = params
            })
            const processor = await buildProcessor(Readable.from([], { objectMode: true }), undefined, security)

            await processor.process(job, 'token')

            expect(uploadParams).toBeDefined()
            return readSecurityMapping(uploadParams as UploadParams)
        },
    })

    it('advances to Finish with the exact uploaded bucket/key after a successful upload', async () => {
        mockUploadDrivenByBody()
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        const result = await processor.process(job, 'token')

        expect(result).toBe('s3://bucket/organizations/org-1/results/file.csv')
        expect(job.updateData).toHaveBeenCalledWith({
            step: BatchEmailVerificationJobStep.Finish,
            resultFilePath: 's3://bucket/organizations/org-1/results/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        })
    })

    it('scopes the result cursor by both organization and batch id', async () => {
        mockUploadDrivenByBody()
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await processor.process(job, 'token')

        expect(queryBuilder.where).toHaveBeenCalledWith('ev.organizationId = :organizationId', {
            organizationId: 'org-1',
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ev.batchId = :batchId', { batchId: 'job-1' })
    })

    it('rejects and never advances to Finish when the S3 upload rejects', async () => {
        mockUploadRejectingDirectly(new Error('upload failed'))
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await expect(processor.process(job, 'token')).rejects.toThrow('upload failed')
        expect(job.updateData).not.toHaveBeenCalled()
    })

    it('rejects instead of hanging when the query cursor stream errors mid-read', async () => {
        mockUploadDrivenByBody()
        const processor = await buildProcessor(erroringCursor(new Error('cursor failed')))

        await expect(processor.process(job, 'token')).rejects.toThrow('cursor failed')
        expect(job.updateData).not.toHaveBeenCalled()
    })

    it('maps alias-prefixed raw row keys without exporting the organization id', async () => {
        // `.stream()` returns raw rows keyed by TypeORM's generated hydration alias ("ev_<property>"), not
        // bare entity property names. Regression coverage for a real bug this fix uncovered: every downloaded
        // batch CSV had a correct header but every data row was blank, because the stringifier was reading
        // bare property-name keys that never existed on the raw rows.
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))

        const cursor = Readable.from(
            [
                { ev_id: 'id-1', ev_organizationId: 'org-1', ev_email: 'person@lef.test' },
                { ev_id: 'id-2', ev_organizationId: 'org-1', ev_email: 'other@lef.test' },
            ],
            { objectMode: true },
        )
        const processor = await buildProcessor(cursor, [
            { propertyName: 'id' },
            { propertyName: 'organizationId' },
            { propertyName: 'email' },
        ])

        await processor.process(job, 'token')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toBe('id,email\nid-1,person@lef.test\nid-2,other@lef.test\n')
    })

    it('rejects an invalid row without copying its address into the queue error', async () => {
        const sentinel = 'unique-person@private.example'
        const csv = Readable.toWeb(Readable.from([`email\n"${sentinel} extra"\n`]))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })
        job.data = {
            step: BatchEmailVerificationJobStep.Validate,
            bucket: 'bucket',
            key: 'organizations/org-1/uploads/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        }
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        const error = await processor.process(job, 'token').catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('batch_email_verification_row_invalid')
        expect((error as Error).message).not.toContain(sentinel)
        expect(job.updateData).not.toHaveBeenCalled()
    })

    it('propagates the parent organization and batch id to every async child job', async () => {
        const csv = Readable.toWeb(Readable.from(['email\nperson@lef.test\nother@lef.test\n']))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })
        job.data = {
            step: BatchEmailVerificationJobStep.Process,
            bucket: 'bucket',
            key: 'organizations/org-1/uploads/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        }
        job.moveToWaitingChildren = jest.fn().mockResolvedValue(true)
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await expect(processor.process(job, 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
        expect(asyncEmailVerificationQueue.add).toHaveBeenCalledTimes(2)
        expect(asyncEmailVerificationQueue.add).toHaveBeenNthCalledWith(
            1,
            'async-email-verification',
            {
                email: 'person@lef.test',
                batchId: 'job-1',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            {
                jobId: expect.any(String),
                parent: {
                    id: 'job-1',
                    queue: 'bull:batch-email-verification',
                },
            },
        )
        expect(asyncEmailVerificationQueue.add).toHaveBeenNthCalledWith(
            2,
            'async-email-verification',
            {
                email: 'other@lef.test',
                batchId: 'job-1',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            {
                jobId: expect.any(String),
                parent: {
                    id: 'job-1',
                    queue: 'bull:batch-email-verification',
                },
            },
        )
    })
})
