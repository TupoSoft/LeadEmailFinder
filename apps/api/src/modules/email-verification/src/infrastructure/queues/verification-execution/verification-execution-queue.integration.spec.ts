import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import { ExecutionOutcome, VerificationExecutionRunner } from '../../../application/operations/verification-execution-runner'
import { BullVerificationExecutionDispatcher } from './bull-verification-execution-dispatcher'
import { VerificationExecutionProcessor } from './verification-execution.processor'
import {
    VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS,
    VERIFICATION_EXECUTION_QUEUE_NAME,
    VerificationExecutionJobData,
    verificationExecutionBackoff,
} from './verification-execution-queue.config'

const redisUrl = process.env['TEST_REDIS_URL']
const describeWithRedis = redisUrl === undefined ? describe.skip : describe

const organizationId = 'organization-1'
const executionId = '6b263662-0f5d-4013-a705-7432665a291e'

describeWithRedis('verification-execution queue compatibility with Redis and BullMQ', () => {
    let connection: Redis
    let prefix: string
    let queue: Queue<VerificationExecutionJobData>
    let queueEvents: QueueEvents
    let worker: Worker<VerificationExecutionJobData> | undefined
    let runner: jest.Mocked<Pick<VerificationExecutionRunner, 'execute'>>
    let workerErrors: Error[]

    beforeEach(async () => {
        prefix = `verification-execution-${randomUUID()}`
        connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
        queue = new Queue(VERIFICATION_EXECUTION_QUEUE_NAME, {
            connection,
            prefix,
            defaultJobOptions: VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS,
        })
        queueEvents = new QueueEvents(VERIFICATION_EXECUTION_QUEUE_NAME, { connection, prefix })
        await Promise.all([queue.waitUntilReady(), queueEvents.waitUntilReady()])
        runner = { execute: jest.fn() }
        workerErrors = []
    })

    afterEach(async () => {
        await worker?.close()
        worker = undefined
        await queueEvents?.close()
        await queue?.obliterate({ force: true })
        await queue?.close()
        await connection?.quit()
        expect(workerErrors).toEqual([])
    })

    function startWorker(): Worker<VerificationExecutionJobData> {
        const processor = new VerificationExecutionProcessor(runner as unknown as VerificationExecutionRunner)
        const created = new Worker<VerificationExecutionJobData>(
            VERIFICATION_EXECUTION_QUEUE_NAME,
            (job, token) => processor.process(job, token),
            { connection, prefix, concurrency: 1, settings: { backoffStrategy: verificationExecutionBackoff } },
        )
        created.on('error', error => workerErrors.push(error))
        worker = created
        return created
    }

    function dispatcher(): BullVerificationExecutionDispatcher {
        return new BullVerificationExecutionDispatcher(queue)
    }

    it('dispatches with the execution ID as the job ID and completes on a settled outcome', async () => {
        runner.execute.mockResolvedValue({ kind: 'settled' })
        await dispatcher().dispatch(executionId, organizationId)
        const job = (await queue.getJob(executionId))!
        expect(job.data).toEqual({ v: 1, executionId, organizationId })

        await startWorker().waitUntilReady()
        await job.waitUntilFinished(queueEvents, 10_000)

        expect(runner.execute).toHaveBeenCalledWith(executionId, organizationId)
        expect(await queue.getJob(executionId)).toBeUndefined()
    }, 15_000)

    it('moves the same job to delayed on a retry-scheduled outcome, then completes it after the delay', async () => {
        runner.execute
            .mockResolvedValueOnce({ kind: 'retry-scheduled', retryAt: new Date(Date.now() + 200) } as ExecutionOutcome)
            .mockResolvedValueOnce({ kind: 'settled' })
        await dispatcher().dispatch(executionId, organizationId)
        const job = (await queue.getJob(executionId))!

        await startWorker().waitUntilReady()
        await job.waitUntilFinished(queueEvents, 10_000)

        expect(runner.execute).toHaveBeenCalledTimes(2)
        expect(await queue.getJob(executionId)).toBeUndefined()
    }, 15_000)

    it('retries a permit-unavailable outcome on the fixed 250ms backoff without duplicating the job', async () => {
        runner.execute
            .mockResolvedValueOnce({ kind: 'permit-unavailable' })
            .mockResolvedValueOnce({ kind: 'settled' })
        await dispatcher().dispatch(executionId, organizationId)
        const job = (await queue.getJob(executionId))!

        await startWorker().waitUntilReady()
        await job.waitUntilFinished(queueEvents, 10_000)

        expect(runner.execute).toHaveBeenCalledTimes(2)
        expect(job.id).toBe(executionId)
        expect(await queue.getJob(executionId)).toBeUndefined()
    }, 15_000)

    it('allows a fresh dispatch to reuse the execution ID once the prior job has completed', async () => {
        runner.execute.mockResolvedValue({ kind: 'settled' })
        await dispatcher().dispatch(executionId, organizationId)
        await startWorker().waitUntilReady()
        await (await queue.getJob(executionId))!.waitUntilFinished(queueEvents, 10_000)
        expect(await queue.getJob(executionId)).toBeUndefined()

        await dispatcher().dispatch(executionId, organizationId)
        const redispatched = (await queue.getJob(executionId))!
        await redispatched.waitUntilFinished(queueEvents, 10_000)

        expect(runner.execute).toHaveBeenCalledTimes(2)
    }, 15_000)
})
