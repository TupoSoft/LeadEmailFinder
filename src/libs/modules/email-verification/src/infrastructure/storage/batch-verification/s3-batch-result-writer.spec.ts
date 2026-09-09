import { Readable } from 'node:stream'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getS3ConnectionToken } from 'nestjs-s3'
import { DataSource } from 'typeorm'
import { Upload } from '@aws-sdk/lib-storage'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import {
    CustomerObjectWriteSecurityMapping,
    customerObjectWriteSecurityContract,
} from '@tuposoft/lead-email-finder/common/testing'
import { EmailVerificationEntity } from '../../persistence/typeorm/email-verification.entity'
import { S3BatchResultWriter } from './s3-batch-result-writer'

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

describe('S3BatchResultWriter', () => {
    let queryBuilder: { where: jest.Mock; andWhere: jest.Mock; stream: jest.Mock }

    beforeEach(() => {
        jest.clearAllMocks()
        queryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            stream: jest.fn(),
        }
    })

    async function buildWriter(
        cursor: Readable,
        metadataColumns: { propertyName: string }[] = [{ propertyName: 'email' }],
        objectWriteSecurity: CustomerObjectWriteSecurity = developmentObjectWriteSecurity,
    ): Promise<S3BatchResultWriter> {
        queryBuilder.stream.mockResolvedValue(cursor)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                S3BatchResultWriter,
                { provide: getS3ConnectionToken('default'), useValue: {} },
                { provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, useValue: objectWriteSecurity },
                {
                    provide: getRepositoryToken(EmailVerificationEntity),
                    useValue: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
                },
                {
                    provide: DataSource,
                    useValue: { getMetadata: jest.fn().mockReturnValue({ columns: metadataColumns }) },
                },
            ],
        }).compile()

        return module.get(S3BatchResultWriter)
    }

    customerObjectWriteSecurityContract('batch result AWS upload adapter', {
        writeWithSecurity: async security => {
            let uploadParams: UploadParams | undefined
            mockUploadDrivenByBody(undefined, params => {
                uploadParams = params
            })
            const writer = await buildWriter(Readable.from([], { objectMode: true }), undefined, security)

            await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

            expect(uploadParams).toBeDefined()
            return readSecurityMapping(uploadParams as UploadParams)
        },
    })

    it('returns the exact result location after a successful upload', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        const result = await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        expect(result).toEqual({ resultFilePath: 's3://bucket/organizations/org-1/results/file.csv' })
    })

    it('scopes the result cursor by both organization and batch id', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        expect(queryBuilder.where).toHaveBeenCalledWith('ev.organizationId = :organizationId', {
            organizationId: 'org-1',
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ev.batchId = :batchId', { batchId: 'job-1' })
    })

    it('rejects when the S3 upload rejects', async () => {
        mockUploadRejectingDirectly(new Error('upload failed'))
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        await expect(writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')).rejects.toThrow(
            'upload failed',
        )
    })

    it('rejects instead of hanging when the query cursor stream errors mid-read', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(erroringCursor(new Error('cursor failed')))

        await expect(writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')).rejects.toThrow(
            'cursor failed',
        )
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
        const writer = await buildWriter(cursor, [
            { propertyName: 'id' },
            { propertyName: 'organizationId' },
            { propertyName: 'email' },
        ])

        await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toBe('id,email\nid-1,person@lef.test\nid-2,other@lef.test\n')
    })

    it('neutralizes streamed customer text before quoting while preserving trusted status and numeric cells', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const values = [
            '=SUM(1,2)',
            '+person@lef.test',
            '-person@lef.test',
            '@person',
            '\tperson',
            '\rperson',
            '\nperson',
            'person@lef.test',
            'quoted,"comma"\nline',
        ]
        const cursor = Readable.from(
            (async function* () {
                for (const value of values) {
                    await Promise.resolve()
                    yield {
                        ev_email: value,
                        ev_localPart: value,
                        ev_copiedInput: value,
                        ev_reason: 'accepted_email',
                        ev_count: -1,
                    }
                }
            })(),
            { objectMode: true, highWaterMark: 1 },
        )
        const writer = await buildWriter(cursor, [
            { propertyName: 'email' },
            { propertyName: 'localPart' },
            { propertyName: 'copiedInput' },
            { propertyName: 'reason' },
            { propertyName: 'count' },
        ])

        await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        const expectedCells = [
            '"\'=SUM(1,2)"',
            "'+person@lef.test",
            "'-person@lef.test",
            "'@person",
            "'\tperson",
            "'\rperson",
            '"\'\nperson"',
            'person@lef.test',
            '"quoted,""comma""\nline"',
        ]
        const expected =
            'email,localPart,copiedInput,reason,count\n' +
            expectedCells.map(cell => `${cell},${cell},${cell},accepted_email,-1\n`).join('')
        expect(Buffer.concat(chunks)).toEqual(Buffer.from(expected))
        expect(chunks.length).toBeGreaterThan(1)
    })
})
