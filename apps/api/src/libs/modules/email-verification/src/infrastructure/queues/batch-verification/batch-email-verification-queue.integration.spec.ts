import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { BatchInput } from '../../../application/delivery/batch/batch-input'
import { BatchResultWriter } from '../../../application/delivery/batch/batch-result-writer'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BatchAdmissionService } from '../../../application/delivery/batch/batch-admission.service'
import { InMemoryBatchAdmissionStore } from '../../../application/delivery/batch/__tests__/in-memory-batch-admission'
import { BatchRowRecord, BatchRowStore } from '../../../application/delivery/batch/batch-row-store'
import { InvalidBatchCsvError } from '../../../application/delivery/batch/batch-terminal-failure'
import { VerificationExecutionDispatcher } from '../../../application/ports/verification-execution-dispatcher'
import { VerificationExecutionStore } from '../../../application/ports/verification-execution-store'
import { InsertRequestOutcome, VerificationRequestStore } from '../../../application/ports/verification-request-store'
import { VerificationResultCacheReader } from '../../../application/ports/verification-result-cache-reader'
import { VerificationCooldownReader } from '../../../application/ports/verification-cooldown-reader'
import { BullBatchJobs } from './bull-batch-jobs'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

const redisUrl = process.env['TEST_REDIS_URL']
const describeWithRedis = redisUrl === undefined ? describe.skip : describe

const cacheTtlMs = 24 * 60 * 60 * 1000
const executionDeadlineMs = 24 * 60 * 60 * 1000
const addressCooldownMs = 60_000

class InMemoryBatchRowStore implements BatchRowStore {
    private rows: BatchRowRecord[] = []

    insertMany(_organizationId: string, rows: readonly BatchRowRecord[]): Promise<void> {
        this.rows.push(...rows)
        return Promise.resolve()
    }

    pageBySourceRow(batchId: string, _organizationId: string, skip: number, take: number): Promise<readonly BatchRowRecord[]> {
        return Promise.resolve(this.rows.filter(row => row.batchId === batchId).slice(skip, skip + take))
    }

    countRows(batchId: string): Promise<number> {
        return Promise.resolve(this.rows.filter(row => row.batchId === batchId).length)
    }
}

describeWithRedis('batch verification queue compatibility with Redis and BullMQ', () => {
    let connection: Redis
    let prefix: string
    let batchQueue: Queue<BatchJobData, string>
    let batchQueueEvents: QueueEvents
    let batchWorker: Worker | undefined
    let jobs: BullBatchJobs
    let admissions: InMemoryBatchAdmissionStore
    let rows: InMemoryBatchRowStore
    let input: jest.Mocked<BatchInput>
    let resultWriter: jest.Mocked<BatchResultWriter>
    let dispatcher: jest.Mocked<VerificationExecutionDispatcher>
    let credits: jest.Mocked<Pick<CreditReservationService, 'reserveMany' | 'closeAdmissionMany'>>
    let workerErrors: Error[]

    async function* twoRows(): AsyncIterable<{ email: string }> {
        await Promise.resolve()
        yield { email: 'person@lef.test' }
        yield { email: 'other@lef.test' }
    }

    beforeEach(async () => {
        prefix = `verification-billing-05-${randomUUID()}`
        connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
        batchQueue = new Queue(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        batchQueueEvents = new QueueEvents(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        await Promise.all([batchQueue.waitUntilReady(), batchQueueEvents.waitUntilReady()])

        admissions = new InMemoryBatchAdmissionStore()
        rows = new InMemoryBatchRowStore()
        jobs = new BullBatchJobs(batchQueue, admissions)
        input = { rows: jest.fn((_bucket: string, _key: string) => twoRows()) }
        resultWriter = { write: jest.fn().mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' }) }
        dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) }
        credits = { reserveMany: jest.fn(), closeAdmissionMany: jest.fn() }
        workerErrors = []
    })

    afterEach(async () => {
        await batchWorker?.close()
        batchWorker = undefined
        await batchQueueEvents?.close()
        // Each queue is owned by this test's random prefix; never flush the shared Redis database.
        await batchQueue?.obliterate({ force: true })
        await batchQueue?.close()
        await connection?.quit()
        expect(workerErrors).toEqual([])
    })

    function admissionService(): BatchAdmissionService {
        const executions: jest.Mocked<VerificationExecutionStore> = {
            claimOrJoin: jest.fn(),
            findById: jest.fn(),
            markQueued: jest.fn(),
            cancelFundingFailure: jest.fn(),
            acquireLease: jest.fn(),
            renewLease: jest.fn(),
            takeoverForRetry: jest.fn(),
            cancelIfNoCaptureIntention: jest.fn(),
            pageNonterminal: jest.fn(),
            pageCanceledPendingCleanup: jest.fn(),
            cancelBatchGroupUnstarted: jest.fn(),
            claimOrJoinForBatchGroup: jest.fn(),
            markBatchGroupQueued: jest.fn(),
            cancelBatchGroupFundingPending: jest.fn(),
        }
        const receipts = new Set<string>()
        admissions.views = {
            executionState: () => undefined,
            executionOwnedBy: () => false,
            receiptExists: requestId => receipts.has(requestId),
        }
        const requests: jest.Mocked<VerificationRequestStore> = {
            findByClientKey: jest.fn(),
            insert: jest.fn(
                (requestInput): Promise<InsertRequestOutcome> =>
                    receipts.add(requestInput.requestId) &&
                    Promise.resolve({
                        kind: 'inserted',
                        record: {
                            requestId: requestInput.requestId,
                            organizationId: requestInput.organizationId,
                            normalizedAddress: requestInput.normalizedAddress,
                            deliveryMode: requestInput.deliveryMode,
                            clientRequestKey: requestInput.clientRequestKey,
                            executionId: requestInput.executionId,
                            resultId: requestInput.resultId,
                            source: requestInput.source,
                            billingState: requestInput.billingState,
                            reservedCount: requestInput.reservedCount,
                            chargedCount: 0,
                            finalReason: requestInput.finalReason,
                            createdAt: new Date(),
                            settledAt: null,
                        },
                    }),
            ),
            findById: jest.fn(),
            attachExecution: jest.fn(),
            settleCanceled: jest.fn(),
        }
        // Every address resolves as an already-cached, already-settled result — this test proves real BullMQ
        // step-machine mechanics, not billing correctness (covered separately by `verification-billing.integration.spec.ts`
        // and `batch-admission.service.spec.ts`), so no execution ever needs a real probe to settle.
        const cacheReader: jest.Mocked<VerificationResultCacheReader> = {
            findLatestCandidate: jest.fn().mockResolvedValue({
                resultId: randomUUID(),
                verificationQuality: 'conclusive_positive',
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
        }
        const cooldownReader: jest.Mocked<VerificationCooldownReader> = { findLatestOutcome: jest.fn().mockResolvedValue(null) }
        return new BatchAdmissionService(
            admissions,
            executions,
            requests,
            cacheReader,
            cooldownReader,
            credits as unknown as CreditReservationService,
            { now: () => new Date() },
            cacheTtlMs,
            executionDeadlineMs,
            addressCooldownMs,
            60_000,
            5_000,
        )
    }

    async function startWorkers(): Promise<void> {
        const workflow = new BatchEmailVerificationWorkflow(
            input,
            rows,
            admissions,
            admissionService(),
            dispatcher,
            resultWriter,
        )
        const processor = new BatchEmailVerificationProcessor(workflow, admissions)

        batchWorker = new Worker(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, (job, token) => processor.process(job, token!), {
            connection,
            prefix,
            concurrency: 1,
        })
        batchWorker.on('error', error => workerErrors.push(error))
        await batchWorker.waitUntilReady()
    }

    it('runs Validate through Finish over real Redis for an all-cached batch', async () => {
        const jobId = randomUUID()
        await expect(
            jobs.enqueue(
                {
                    step: BatchJobStep.Validate,
                    bucket: 'bucket',
                    key: 'key',
                    organizationId: 'org-1',
                    credentialId: 'cred-1',
                },
                jobId,
            ),
        ).resolves.toEqual({ id: jobId })

        const job = (await batchQueue.getJob(jobId))!
        const completed = job.waitUntilFinished(batchQueueEvents, 10_000)
        await startWorkers()

        await expect(completed).resolves.toBe('s3://bucket/results/file.csv')

        expect(dispatcher.dispatch).not.toHaveBeenCalled()
        expect(resultWriter.write).toHaveBeenCalledWith('bucket', 'key', 'org-1', jobId)

        const handle = await jobs.find(jobId)
        expect(handle?.data).toEqual({
            step: BatchJobStep.Finish,
            resultFilePath: 's3://bucket/results/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        })
        await expect(handle?.readStatus()).resolves.toEqual({
            state: 'completed',
            resultLocation: 's3://bucket/results/file.csv',
        })

        const finalCounts = await handle?.counts()
        expect(finalCounts).toEqual({ processed: 2, unprocessed: 0 })
    }, 15_000)

    it('returns undefined for a job Redis has never seen', async () => {
        await expect(jobs.find(randomUUID())).resolves.toBeUndefined()
    })

    it.each(['invalid_csv', 'processing_failed'] as const)(
        'persists only %s for a real terminal worker failure',
        async failureCode => {
            if (failureCode === 'invalid_csv') {
                input.rows.mockImplementation(() => {
                    throw new InvalidBatchCsvError()
                })
            } else {
                resultWriter.write.mockRejectedValue(new Error('synthetic storage failure'))
            }
            const jobId = randomUUID()
            await jobs.enqueue(
                {
                    step: BatchJobStep.Validate,
                    bucket: 'bucket',
                    key: 'key',
                    organizationId: 'org-1',
                    credentialId: 'cred-1',
                },
                jobId,
            )
            const job = (await batchQueue.getJob(jobId))!
            const finished = expect(job.waitUntilFinished(batchQueueEvents, 10_000)).rejects.toThrow()
            await startWorkers()
            await finished

            const handle = await jobs.find(jobId)
            await expect(handle?.readStatus()).resolves.toEqual({ state: 'failed', failureCode })
            expect(JSON.stringify(handle?.data)).not.toMatch(/synthetic storage failure|stacktrace/)
        },
        15_000,
    )

    it('persists insufficient_credits for a real terminal reservation failure', async () => {
        credits.reserveMany.mockRejectedValue(new InsufficientCreditsException('org-1'))
        const jobId = randomUUID()
        await jobs.enqueue(
            {
                step: BatchJobStep.Validate,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            jobId,
        )
        const job = (await batchQueue.getJob(jobId))!
        const completed = job.waitUntilFinished(batchQueueEvents, 10_000)
        await startWorkers()

        // Insufficient credits fences the group without failing the job: every address still gets a safe, free,
        // zero-charge row, and the batch completes normally with its results.
        await expect(completed).resolves.toBe('s3://bucket/results/file.csv')
    }, 15_000)

    it('exposes a later successful attempt without the previous failure marker', async () => {
        resultWriter.write.mockRejectedValueOnce(new Error('synthetic temporary storage failure'))
        const job = await batchQueue.add(
            BATCH_EMAIL_VERIFICATION_QUEUE_NAME,
            {
                step: BatchJobStep.Validate,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            { jobId: randomUUID(), attempts: 3, backoff: { type: 'fixed', delay: 10 } },
        )
        const finished = job.waitUntilFinished(batchQueueEvents, 10_000)
        await startWorkers()
        await expect(finished).resolves.toBe('s3://bucket/results/file.csv')

        const handle = await jobs.find(job.id!)
        await expect(handle?.readStatus()).resolves.toEqual({
            state: 'completed',
            resultLocation: 's3://bucket/results/file.csv',
        })
        expect(resultWriter.write).toHaveBeenCalledTimes(2)
    }, 15_000)
})
