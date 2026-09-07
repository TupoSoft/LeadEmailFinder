import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { BatchInput } from '../../../application/delivery/batch/batch-input'
import { BatchResultWriter } from '../../../application/delivery/batch/batch-result-writer'
import { BatchEmailVerificationWorkflow } from '../../../application/delivery/batch/batch-email-verification-workflow'
import { BullBatchJobs } from './bull-batch-jobs'
import { BullBatchChildFlow } from './bull-batch-child-flow'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

const redisUrl = process.env['TEST_REDIS_URL']
const describeWithRedis = redisUrl === undefined ? describe.skip : describe

describeWithRedis('batch verification queue compatibility with Redis and BullMQ', () => {
    let connection: Redis
    let prefix: string
    let batchQueue: Queue<BatchJobData, string>
    let asyncQueue: Queue
    let batchQueueEvents: QueueEvents
    let batchWorker: Worker | undefined
    let asyncWorker: Worker | undefined
    let jobs: BullBatchJobs
    let childFlow: BullBatchChildFlow
    let input: jest.Mocked<BatchInput>
    let resultWriter: jest.Mocked<BatchResultWriter>
    let creditsService: jest.Mocked<CreditsService>
    let workerErrors: Error[]

    async function* twoRows(): AsyncIterable<{ email: string }> {
        await Promise.resolve()
        yield { email: 'person@lef.test' }
        yield { email: 'other@lef.test' }
    }

    beforeEach(async () => {
        prefix = `issue-461-${randomUUID()}`
        connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
        batchQueue = new Queue(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        asyncQueue = new Queue('async-email-verification', { connection, prefix })
        batchQueueEvents = new QueueEvents(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        await Promise.all([batchQueue.waitUntilReady(), asyncQueue.waitUntilReady(), batchQueueEvents.waitUntilReady()])

        jobs = new BullBatchJobs(batchQueue)
        childFlow = new BullBatchChildFlow(batchQueue, asyncQueue)
        input = { rows: jest.fn((_bucket: string, _key: string) => twoRows()) }
        resultWriter = { write: jest.fn().mockResolvedValue({ resultFilePath: 's3://bucket/results/file.csv' }) }
        creditsService = { debit: jest.fn() } as unknown as jest.Mocked<CreditsService>
        workerErrors = []
    })

    afterEach(async () => {
        await batchWorker?.close()
        await asyncWorker?.close()
        batchWorker = undefined
        asyncWorker = undefined
        await batchQueueEvents?.close()
        // Each queue is owned by this test's random prefix; never flush the shared Redis database.
        await batchQueue?.obliterate({ force: true })
        await asyncQueue?.obliterate({ force: true })
        await Promise.all([batchQueue?.close(), asyncQueue?.close()])
        await connection?.quit()
        expect(workerErrors).toEqual([])
    })

    async function startWorkers(): Promise<void> {
        const workflow = new BatchEmailVerificationWorkflow(input, childFlow, resultWriter, creditsService)
        const processor = new BatchEmailVerificationProcessor(workflow)

        batchWorker = new Worker(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, (job, token) => processor.process(job, token!), {
            connection,
            prefix,
            concurrency: 1,
        })
        // Real children are resolved immediately: this test proves the batch/async parent-child wiring, not
        // async delivery's own verification behavior (already covered by its own queue integration test).
        asyncWorker = new Worker('async-email-verification', () => Promise.resolve({}), {
            connection,
            prefix,
            concurrency: 5,
        })
        batchWorker.on('error', error => workerErrors.push(error))
        asyncWorker.on('error', error => workerErrors.push(error))
        await Promise.all([batchWorker.waitUntilReady(), asyncWorker.waitUntilReady()])
    }

    it('runs Validate through Finish over real Redis, dispatching one real child per row', async () => {
        const jobId = randomUUID()
        await expect(
            jobs.enqueue(
                { step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' },
                jobId,
            ),
        ).resolves.toEqual({ id: jobId })

        const job = (await batchQueue.getJob(jobId))!
        const completed = job.waitUntilFinished(batchQueueEvents, 10_000)
        await startWorkers()

        await expect(completed).resolves.toBe('s3://bucket/results/file.csv')

        expect(creditsService.debit).toHaveBeenCalledWith('org-1', 2, jobId)
        expect(resultWriter.write).toHaveBeenCalledWith('bucket', 'key', 'org-1', jobId)

        const handle = await jobs.find(jobId)
        expect(handle?.data).toEqual({
            step: BatchJobStep.Finish,
            resultFilePath: 's3://bucket/results/file.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        })
        await expect(handle?.returnValue()).resolves.toBe('s3://bucket/results/file.csv')
        await expect(handle?.state()).resolves.toBe('completed')

        const finalCounts = await handle?.counts()
        expect(finalCounts).toEqual({ processed: 2, unprocessed: 0 })
    }, 15_000)

    it('returns undefined for a job Redis has never seen', async () => {
        await expect(jobs.find(randomUUID())).resolves.toBeUndefined()
    })
})
