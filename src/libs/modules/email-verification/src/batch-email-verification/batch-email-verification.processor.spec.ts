import { Logger } from '@nestjs/common'
import pino from 'pino'
import { randomUUID } from 'node:crypto'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { S3 } from 'nestjs-s3'
import { LoggingVerificationTraceObserver } from '../infrastructure/verification-trace/logging-verification-trace-observer'
import { AsyncEmailVerificationProcessor } from '../infrastructure/queues/async-verification/async-email-verification.processor'
import { AsyncEmailVerificationJobData } from '../infrastructure/queues/async-verification/async-email-verification-job-data.interface'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'
import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'
import {
    VERIFICATION_TRACE_OBSERVER,
    VerificationTraceObserver,
} from '../application/verification-trace/verification-trace-observer'
import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getS3ConnectionToken } from 'nestjs-s3'
import { DataSource } from 'typeorm'
import { Job, Queue, WaitingChildrenError } from 'bullmq'
import { Readable } from 'node:stream'
import { Upload } from '@aws-sdk/lib-storage'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { EmailVerificationOrchestrator } from '../application/email-verification.service'
import { EmailVerificationEntity } from '../infrastructure/persistence/typeorm/email-verification.entity'
import { DomainPolicyService } from '../application/domain-policy.service'
import { EmailAdministrationService } from '../application/email-administration.service'
import { MailboxVerificationService } from '../application/mailbox-verification.service'
import { VerificationStore } from '../application/ports/verification-store'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN,
    CustomerObjectWriteSecurity,
} from '@tuposoft/lead-email-finder/common'
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
    let traceObserver: jest.Mocked<VerificationTraceObserver>
    let queryBuilder: { where: jest.Mock; andWhere: jest.Mock; stream: jest.Mock }
    let asyncEmailVerificationQueue: { add: jest.Mock }
    let s3: { getObject: jest.Mock }
    let job: Job<BatchEmailVerificationJobData, string> & { updateData: jest.Mock }

    beforeEach(() => {
        traceObserver = {
            enqueued: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            batchCompleted: jest.fn(),
        }

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
            attemptsMade: 0,
            getDependenciesCount: jest.fn().mockResolvedValue({ processed: 2, unprocessed: 0 }),
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
        observer: VerificationTraceObserver = traceObserver,
    ): Promise<BatchEmailVerificationProcessor> {
        queryBuilder.stream.mockResolvedValue(cursor)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                { provide: VERIFICATION_TRACE_OBSERVER, useValue: observer },
                BatchEmailVerificationProcessor,
                { provide: getS3ConnectionToken('default'), useValue: s3 },
                { provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, useValue: objectWriteSecurity },
                { provide: getQueueToken('async-email-verification'), useValue: asyncEmailVerificationQueue },
                {
                    provide: getRepositoryToken(EmailVerificationEntity),
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
        expect(traceObserver.failed).toHaveBeenCalledWith({
            operationId: 'job-1',
            mode: 'batch',
            jobId: 'job-1',
            batchId: 'job-1',
            attempt: 1,
            stage: 'batch_validation',
            errorType: 'Error',
            durationMs: expect.any(Number),
        })
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain(sentinel)
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
        expect(traceObserver.failed).not.toHaveBeenCalled()
        expect(traceObserver.batchCompleted).not.toHaveBeenCalled()
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
    it('emits only bounded completion counts alongside the stable batch ID', async () => {
        mockUploadDrivenByBody()
        job.getDependenciesCount = jest.fn().mockResolvedValue({ processed: 3.8, unprocessed: -1 })
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await processor.process(job, 'token')

        expect(traceObserver.batchCompleted).toHaveBeenCalledWith({
            batchId: 'job-1',
            total: 3,
            processed: 3,
            unprocessed: 0,
            durationMs: expect.any(Number),
        })
        expect(traceObserver.failed).not.toHaveBeenCalled()
    })

    it.each(['observer', 'counts'])('keeps the uploaded result when completion %s fails', async failure => {
        mockUploadDrivenByBody()
        if (failure === 'observer') {
            traceObserver.batchCompleted.mockImplementation(() => {
                throw new Error('observer unavailable')
            })
        } else {
            job.getDependenciesCount = jest.fn().mockRejectedValue(new Error('queue unavailable'))
        }
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await expect(processor.process(job, 'token')).resolves.toBe('s3://bucket/organizations/org-1/results/file.csv')
        expect(job.data.step).toBe(BatchEmailVerificationJobStep.Finish)
        expect(traceObserver.failed).not.toHaveBeenCalled()
    })

    it('preserves failed publication and reports the same job on retry even when the observer fails', async () => {
        const error = new Error('sentinel@private.example upload diagnostics')
        mockUploadRejectingDirectly(error)
        traceObserver.failed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await expect(processor.process(job, 'token')).rejects.toBe(error)
        job.attemptsMade = 1
        queryBuilder.stream.mockResolvedValue(Readable.from([], { objectMode: true }))
        await expect(processor.process(job, 'token')).rejects.toBe(error)

        expect(traceObserver.failed.mock.calls.map(([event]) => event)).toEqual([
            {
                operationId: 'job-1',
                mode: 'batch',
                jobId: 'job-1',
                batchId: 'job-1',
                attempt: 1,
                stage: 'batch_result_publication',
                errorType: 'Error',
                durationMs: expect.any(Number),
            },
            {
                operationId: 'job-1',
                mode: 'batch',
                jobId: 'job-1',
                batchId: 'job-1',
                attempt: 2,
                stage: 'batch_result_publication',
                errorType: 'Error',
                durationMs: expect.any(Number),
            },
        ])
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('sentinel')
        expect(traceObserver.batchCompleted).not.toHaveBeenCalled()
        expect(job.updateData).not.toHaveBeenCalled()
    })

    it('classifies child queue failures as dispatch failures while preserving the original error', async () => {
        const error = new Error('private queue diagnostic')
        asyncEmailVerificationQueue.add.mockRejectedValue(error)
        const csv = Readable.toWeb(Readable.from(['email\nperson@lef.test\n']))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })
        job.data = {
            step: BatchEmailVerificationJobStep.Process,
            bucket: 'bucket',
            key: 'private-key',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        }
        const processor = await buildProcessor(Readable.from([], { objectMode: true }))

        await expect(processor.process(job, 'token')).rejects.toBe(error)

        expect(traceObserver.failed).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: 'job-1',
                jobId: 'job-1',
                batchId: 'job-1',
                stage: 'queue_dispatch',
                errorType: 'Error',
            }),
        )
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('private')
        expect(traceObserver.batchCompleted).not.toHaveBeenCalled()
    })
    it('captures the batch request, child result, parent completion, and invalid-row failure without private text', async () => {
        const captured: Record<string, unknown>[] = []
        const traceEvents = (): Record<string, unknown>[] =>
            captured.filter(event => typeof event.event === 'string' && event.event.startsWith('verification_'))
        const logger = pino(
            { base: null, timestamp: false },
            {
                write: (line: string) => {
                    captured.push(JSON.parse(line) as Record<string, unknown>)
                },
            },
        )
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => logger.info(message))
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => logger.warn(message))
        const observer = new LoggingVerificationTraceObserver()
        const requestId = randomUUID()
        const organizationId = randomUUID()
        const localPart = 'batch-sentinel-' + randomUUID()
        const domain = 'private-batch-domain.test'
        const email = localPart + '@' + domain
        const mx = 'mx.' + domain
        const secret = 'private-upload-key-' + randomUUID()
        const verificationId = randomUUID()
        const principal = { organizationId, credentialId: randomUUID() } as AuthPrincipal
        const file = { bucket: 'private-bucket', key: secret } as BatchEmailVerificationFile
        const children: Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>[] = []

        try {
            const queue = {
                add: jest.fn((_name: string, data: BatchEmailVerificationJobData, options: { jobId: string }) => {
                    job.id = options.jobId
                    job.data = data
                    return job
                }),
            }
            const submission = new BatchEmailVerificationServiceImpl(
                queue as unknown as Queue<BatchEmailVerificationJobData, string>,
                s3 as unknown as S3,
                observer,
            )
            const { id: batchId } = await submission.uploadFile(file, principal, requestId)
            asyncEmailVerificationQueue.add.mockImplementation(
                (_name: string, data: AsyncEmailVerificationJobData, options: { jobId: string }) => {
                    const child = { id: options.jobId, data, attemptsMade: 0 } as Job<
                        AsyncEmailVerificationJobData,
                        IEmailVerificationResponseDto
                    >
                    children.push(child)
                    return Promise.resolve(child)
                },
            )
            s3.getObject.mockImplementation(() =>
                Promise.resolve({
                    Body: { transformToWebStream: () => Readable.toWeb(Readable.from(['email\n' + email + '\n'])) },
                }),
            )
            job.moveToWaitingChildren = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
            job.getDependenciesCount = jest.fn().mockResolvedValue({ processed: 1, unprocessed: 0 })
            mockUploadDrivenByBody()
            const processor = await buildProcessor(
                Readable.from([], { objectMode: true }),
                undefined,
                undefined,
                observer,
            )

            await expect(processor.process(job, 'token')).rejects.toBeInstanceOf(WaitingChildrenError)
            expect(children).toHaveLength(1)
            expect(captured.filter(event => event.event === 'verification_failed')).toHaveLength(0)

            const verificationService = new EmailVerificationOrchestrator(
                {
                    verify: jest.fn().mockResolvedValue({
                        email,
                        domain,
                        localPart,
                        targetExchange: mx,
                        exists: true,
                        catchAll: false,
                        reason: EmailVerificationReason.AcceptedEmail,
                        sources: [],
                    }),
                } as unknown as MailboxVerificationService,
                {
                    create: (organizationId: string, record: unknown) =>
                        Promise.resolve({ ...(record as object), organizationId, id: verificationId, createdAt: new Date() }),
                } as unknown as VerificationStore,
                { upsertEmail: () => Promise.resolve(undefined) } as unknown as EmailAdministrationService,
                { isVerificationAllowed: () => Promise.resolve(true) } as unknown as DomainPolicyService,
                observer,
            )
            const childProcessor = new AsyncEmailVerificationProcessor(verificationService)
            const result = await childProcessor.process(children[0])
            expect(result.id).toBe(verificationId)
            await expect(processor.process(job, 'token')).resolves.toEqual(expect.any(String))

            expect(traceEvents()).toEqual([
                expect.objectContaining({ event: 'verification_enqueued', mode: 'batch', requestId, jobId: batchId }),
                expect.objectContaining({
                    event: 'verification_completed',
                    mode: 'batch_child',
                    operationId: children[0].id,
                    jobId: children[0].id,
                    batchId,
                    verificationId,
                    reason: EmailVerificationReason.AcceptedEmail,
                    attempt: 1,
                }),
                expect.objectContaining({
                    event: 'verification_batch_completed',
                    batchId,
                    total: 1,
                    processed: 1,
                    unprocessed: 0,
                }),
            ])

            const invalidBatchId = randomUUID()
            job.id = invalidBatchId
            job.data = {
                step: BatchEmailVerificationJobStep.Validate,
                organizationId,
                credentialId: principal.credentialId,
                bucket: file.bucket,
                key: file.key,
            }
            s3.getObject.mockImplementation(() =>
                Promise.resolve({
                    Body: {
                        transformToWebStream: () => Readable.toWeb(Readable.from(['email\n"' + email + ' invalid"\n'])),
                    },
                }),
            )
            await expect(processor.process(job, 'token')).rejects.toThrow('batch_email_verification_row_invalid')
            expect(traceEvents()[3]).toEqual(
                expect.objectContaining({
                    event: 'verification_failed',
                    mode: 'batch',
                    operationId: invalidBatchId,
                    batchId: invalidBatchId,
                    jobId: invalidBatchId,
                    stage: 'batch_validation',
                    errorType: 'Error',
                    attempt: 1,
                }),
            )
            expect(traceEvents()).toHaveLength(4)
            const output = JSON.stringify(captured)
            for (const privateValue of [
                email,
                encodeURIComponent(email),
                localPart,
                domain,
                mx,
                secret,
                organizationId,
                principal.credentialId,
            ]) {
                expect(output).not.toContain(privateValue)
            }
        } finally {
            log.mockRestore()
            warn.mockRestore()
        }
    })
})
