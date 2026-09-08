import { randomUUID } from 'node:crypto'
import { Job, Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
} from '@tuposoft/lead-email-finder/common'
import { AsyncEmailVerificationService } from '../../../application/delivery/async/async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from '../../../application/delivery/async/job-not-found.exception'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import {
    ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
    ASYNC_EMAIL_VERIFICATION_JOB_NAME,
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
    asyncEmailVerificationBackoff,
} from './async-email-verification-queue.config'
import { BullAsyncVerificationJobs } from './bull-async-verification-jobs'

const redisUrl = process.env['TEST_REDIS_URL']
const describeWithRedis = redisUrl === undefined ? describe.skip : describe

// Version 1 preserves the serialized fields and order emitted before the layer move.
const DIRECT_JOB_DATA_V1 =
    '{"email":"person@example.test","organizationId":"owner-organization","credentialId":"owner-credential"}'
const BATCH_CHILD_JOB_DATA_V1 =
    '{"email":"person@example.test","batchId":"72b70931-d3fd-4295-9d9c-ab01799609ad","organizationId":"owner-organization","credentialId":"owner-credential"}'

type VerificationQueue = Queue<
    AsyncEmailVerificationJobData,
    IEmailVerificationResponseDto,
    typeof ASYNC_EMAIL_VERIFICATION_JOB_NAME
>

describeWithRedis('async verification queue compatibility with Redis and BullMQ', () => {
    let connection: Redis
    let prefix: string
    let queue: VerificationQueue
    let batchProducer: VerificationQueue
    let parentQueue: Queue
    let queueEvents: QueueEvents
    let worker: Worker<AsyncEmailVerificationJobData, IEmailVerificationResponseDto> | undefined
    let jobs: BullAsyncVerificationJobs
    let service: AsyncEmailVerificationService
    let core: jest.Mocked<IEmailVerificationService>
    let productionDelays: number[]
    let workerErrors: Error[]

    const result: IEmailVerificationResponseDto = {
        id: '6b263662-0f5d-4013-a705-7432665a291e',
        email: 'person@example.test',
        domain: 'example.test',
        localPart: 'person',
        sources: [],
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        createdAt: new Date('2026-09-07T00:00:00.000Z'),
    }

    beforeEach(async () => {
        prefix = `issue-460-${randomUUID()}`
        connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
        queue = new Queue(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME, {
            connection,
            prefix,
            defaultJobOptions: ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
        })
        // The existing batch producer registers the same queue without default retry options.
        batchProducer = new Queue(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        parentQueue = new Queue('batch-email-verification', { connection, prefix })
        queueEvents = new QueueEvents(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME, { connection, prefix })
        await Promise.all([queue.waitUntilReady(), parentQueue.waitUntilReady(), queueEvents.waitUntilReady()])
        jobs = new BullAsyncVerificationJobs(queue)
        service = new AsyncEmailVerificationService(jobs)
        core = { verify: jest.fn().mockResolvedValue(result) }
        productionDelays = []
        workerErrors = []
    })

    afterEach(async () => {
        await worker?.close()
        worker = undefined
        await queueEvents?.close()
        // Each queue is owned by this test's random prefix; never flush the shared Redis database.
        await queue?.obliterate({ force: true })
        await parentQueue?.obliterate({ force: true })
        await Promise.all([queue?.close(), batchProducer?.close(), parentQueue?.close()])
        await connection?.quit()
        expect(workerErrors).toEqual([])
    })

    async function startWorker(): Promise<void> {
        const processor = new AsyncEmailVerificationProcessor(core)
        worker = new Worker(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME, job => processor.process(job), {
            connection,
            prefix,
            concurrency: 1,
            settings: {
                backoffStrategy: (attemptsMade, type, error) => {
                    const delay = asyncEmailVerificationBackoff(attemptsMade, type, error)
                    productionDelays.push(delay)
                    // The production function has separate exact-duration checks; accelerate only this test clock.
                    return delay / 1000
                },
            },
        })
        worker.on('error', error => workerErrors.push(error))
        await worker.waitUntilReady()
    }

    async function enqueueDirect(
        id: string,
    ): Promise<Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>> {
        const data = JSON.parse(DIRECT_JOB_DATA_V1) as AsyncEmailVerificationJobData
        await expect(jobs.enqueue(data, id)).resolves.toEqual({ id })
        const job = await queue.getJob(id)
        expect(job).toBeDefined()
        return job!
    }

    it.each([true, false])(
        'isolates owned status in either lookup order (owner first: %s) without duplicate work',
        async ownerFirst => {
            const enqueue = jest.spyOn(jobs, 'enqueue')
            const { id } = await service.verifyAsync(JSON.parse(DIRECT_JOB_DATA_V1) as AsyncEmailVerificationJobData)
            const job = (await queue.getJob(id))!
            expect(id).toMatch(/^[0-9a-f-]{36}$/)
            expect(await connection.hget(queue.toKey(id), 'data')).toBe(DIRECT_JOB_DATA_V1)
            expect(job.name).toBe('async-email-verification')
            expect(job.opts).toMatchObject({ attempts: 5, backoff: { type: 'async-email-verification' }, jobId: id })

            const readOwnedStatus = async (state: 'queued' | 'completed'): Promise<void> => {
                const owner = async (): Promise<void> => {
                    const status = await service.getAsyncVerificationState(id, 'owner-organization')
                    expect(status.state).toBe(state)
                    if (status.state === 'completed') {
                        const safeResult = JSON.parse(JSON.stringify(result)) as Record<string, unknown>
                        delete safeResult.createdAt
                        expect(status.result).toEqual(safeResult)
                    } else {
                        expect(status).toEqual({ state })
                    }
                }
                const foreign = async (): Promise<void> => {
                    await expect(service.getAsyncVerificationState(id, 'foreign-organization')).rejects.toBeInstanceOf(
                        AsyncEmailVerificationJobNotFoundException,
                    )
                }
                for (const read of ownerFirst ? [owner, foreign, owner] : [foreign, owner, foreign]) {
                    await read()
                }
            }

            await readOwnedStatus('queued')
            await expect(service.getAsyncVerificationState(randomUUID(), 'owner-organization')).rejects.toBeInstanceOf(
                AsyncEmailVerificationJobNotFoundException,
            )
            expect(core.verify).not.toHaveBeenCalled()
            const completed = job.waitUntilFinished(queueEvents, 10_000)
            await startWorker()
            await expect(completed).resolves.toEqual(JSON.parse(JSON.stringify(result)))
            await readOwnedStatus('completed')
            expect(enqueue).toHaveBeenCalledTimes(1)
            expect(core.verify).toHaveBeenCalledTimes(1)
            expect(core.verify).toHaveBeenCalledWith({
                organizationId: 'owner-organization',
                email: 'person@example.test',
                format: undefined,
                batchId: undefined,
                trace: { operationId: id, mode: 'async', jobId: id, attempt: 1 },
            })
            expect(await queue.getJobCounts('completed', 'failed', 'waiting', 'active', 'delayed')).toEqual({
                completed: 1,
                failed: 0,
                waiting: 0,
                active: 0,
                delayed: 0,
                paused: 0,
            })
        },
        15_000,
    )

    it('deserializes an existing batch child and records one completion on its real parent dependency', async () => {
        const data = JSON.parse(BATCH_CHILD_JOB_DATA_V1) as AsyncEmailVerificationJobData
        const parent = await parentQueue.add('batch-email-verification', {}, { jobId: data.batchId })
        const childId = randomUUID()
        const child = await batchProducer.add(ASYNC_EMAIL_VERIFICATION_JOB_NAME, data, {
            jobId: childId,
            parent: { id: parent.id!, queue: parent.queueQualifiedName },
        })
        expect(await connection.hget(queue.toKey(childId), 'data')).toBe(BATCH_CHILD_JOB_DATA_V1)
        expect(child.opts.attempts).toBe(0)
        expect(child.opts.backoff).toBeUndefined()
        const restoredChild = (await queue.getJob(childId))!
        expect(restoredChild.data).toEqual(data)
        expect(restoredChild.parent).toEqual({ id: parent.id, queueKey: parent.queueQualifiedName })

        const completed = restoredChild.waitUntilFinished(queueEvents, 10_000)
        await startWorker()
        await expect(completed).resolves.toEqual(JSON.parse(JSON.stringify(result)))
        expect(core.verify).toHaveBeenCalledTimes(1)
        expect(core.verify).toHaveBeenCalledWith({
            organizationId: data.organizationId,
            email: data.email,
            format: undefined,
            batchId: data.batchId,
            trace: {
                operationId: childId,
                mode: 'batch_child',
                jobId: childId,
                batchId: data.batchId,
                attempt: 1,
            },
        })
        expect(await parent.getChildrenValues()).toEqual({
            [queue.toKey(childId)]: JSON.parse(JSON.stringify(result)),
        })
        expect(await parent.getDependenciesCount()).toEqual({ processed: 1, unprocessed: 0, ignored: 0, failed: 0 })
    }, 15_000)

    it('preserves the job ID through greylist delay and eventual completion', async () => {
        core.verify
            .mockResolvedValueOnce({
                ...result,
                exists: null,
                catchAll: null,
                reason: EmailVerificationReason.TemporarilyBlocked,
            })
            .mockResolvedValue(result)
        const id = randomUUID()
        const job = await enqueueDirect(id)
        const delayedIds: string[] = []
        queueEvents.on('delayed', ({ jobId }) => delayedIds.push(jobId))
        const completed = job.waitUntilFinished(queueEvents, 10_000)
        await startWorker()

        await expect(completed).resolves.toEqual(JSON.parse(JSON.stringify(result)))
        expect(productionDelays).toEqual([60_000])
        expect(delayedIds).toEqual([id])
        expect(core.verify.mock.calls.map(([command]) => command.trace)).toEqual([
            { operationId: id, mode: 'async', jobId: id, attempt: 1 },
            { operationId: id, mode: 'async', jobId: id, attempt: 2 },
        ])
        expect((await queue.getJob(id))?.attemptsMade).toBe(2)
        await expect(service.getAsyncVerificationState(id, 'owner-organization')).resolves.toMatchObject({
            state: 'completed',
        })
        expect(await queue.getJobCounts('completed', 'failed')).toEqual({ completed: 1, failed: 0 })
    }, 15_000)

    it('exhausts five greylist attempts without duplicating the job or exposing its payload in failure', async () => {
        core.verify.mockResolvedValue({
            ...result,
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.TemporarilyBlocked,
        })
        const id = randomUUID()
        const job = await enqueueDirect(id)
        const failure = expect(job.waitUntilFinished(queueEvents, 10_000)).rejects.toThrow(
            'Email verification is temporarily greylisted.',
        )
        await startWorker()
        await failure

        expect(productionDelays).toEqual([60_000, 120_000, 180_000, 240_000])
        expect(core.verify).toHaveBeenCalledTimes(5)
        expect(core.verify.mock.calls.map(([command]) => command.trace)).toEqual(
            [1, 2, 3, 4, 5].map(attempt => ({ operationId: id, mode: 'async', jobId: id, attempt })),
        )
        const failed = (await queue.getJob(id))!
        expect(failed.attemptsMade).toBe(5)
        expect(failed.failedReason).toBe('Email verification is temporarily greylisted.')
        expect(JSON.stringify(failed.stacktrace)).not.toContain(result.email)
        expect(JSON.stringify(failed.stacktrace)).not.toContain('owner-credential')
        await expect(service.getAsyncVerificationState(id, 'owner-organization')).resolves.toEqual({
            state: 'failed',
            failureCode: 'verification_failed',
        })
        expect(await queue.getJobCounts('completed', 'failed')).toEqual({ completed: 0, failed: 1 })
    }, 15_000)

    it('retries ordinary worker failures with the existing ten-second production backoff', async () => {
        core.verify.mockRejectedValueOnce(new Error('verification_failed')).mockResolvedValue(result)
        const id = randomUUID()
        const job = await enqueueDirect(id)
        const completed = job.waitUntilFinished(queueEvents, 10_000)
        await startWorker()

        await expect(completed).resolves.toEqual(JSON.parse(JSON.stringify(result)))
        expect(productionDelays).toEqual([10_000])
        expect(core.verify).toHaveBeenCalledTimes(2)
        expect((await queue.getJob(id))?.id).toBe(id)
        expect((await queue.getJob(id))?.attemptsMade).toBe(2)
    }, 15_000)
})
