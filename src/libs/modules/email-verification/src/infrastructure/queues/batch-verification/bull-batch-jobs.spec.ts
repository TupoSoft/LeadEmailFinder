import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { BatchJobData, BatchJobStep } from '../../../domain/batch-job'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { BullBatchJobs } from './bull-batch-jobs'

describe('BullBatchJobs', () => {
    let queue: { add: jest.Mock; getJob: jest.Mock }
    let jobs: BullBatchJobs

    beforeEach(async () => {
        queue = { add: jest.fn(), getJob: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BullBatchJobs,
                { provide: getQueueToken(BATCH_EMAIL_VERIFICATION_QUEUE_NAME), useValue: queue },
            ],
        }).compile()

        jobs = module.get(BullBatchJobs)
    })

    it('enqueues a new batch job at the Validate step under the queue name', async () => {
        queue.add.mockResolvedValueOnce({ id: 'job-1' })

        const result = await jobs.enqueue(
            {
                step: BatchJobStep.Validate,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            'job-1',
        )

        expect(result).toEqual({ id: 'job-1' })
        expect(queue.add).toHaveBeenCalledWith(
            BATCH_EMAIL_VERIFICATION_QUEUE_NAME,
            {
                step: BatchJobStep.Validate,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            { jobId: 'job-1' },
        )
    })

    it('returns undefined when the job does not exist', async () => {
        queue.getJob.mockResolvedValueOnce(undefined)

        await expect(jobs.find('missing')).resolves.toBeUndefined()
    })

    it.each([
        ['waiting', 'queued'],
        ['delayed', 'queued'],
        ['prioritized', 'queued'],
        ['waiting-children', 'queued'],
        ['paused', 'queued'],
        ['active', 'running'],
        ['completed', 'completed'],
        ['failed', 'failed'],
        ['unknown', 'unavailable'],
        ['future-private-queue-state', 'unavailable'],
    ])('normalizes %s before crossing the application boundary', async (rawState, state) => {
        queue.getJob.mockResolvedValue({
            id: 'job-1',
            data: { failureCode: 'invalid_csv' },
            getState: jest.fn().mockResolvedValue(rawState),
            returnvalue: 's3://bucket/results/file.csv',
            failedReason: 'private parser details',
            stacktrace: ['private stack'],
        })

        const handle = await jobs.find('job-1')

        await expect(handle?.readStatus()).resolves.toEqual(
            state === 'completed'
                ? { state, resultLocation: 's3://bucket/results/file.csv' }
                : state === 'failed'
                  ? { state, failureCode: 'invalid_csv' }
                  : { state },
        )
    })

    it.each([undefined, null, {}, '', 'https://private.example/result.csv', 's3://bucket/', 's3://bucket/%zz'])(
        'omits an invalid completed result location %#',
        async returnvalue => {
            queue.getJob.mockResolvedValue({
                data: {},
                getState: jest.fn().mockResolvedValue('completed'),
                returnvalue,
            })

            const handle = await jobs.find('job-1')

            await expect(handle?.readStatus()).resolves.toEqual({ state: 'completed', resultLocation: undefined })
        },
    )

    it('refreshes terminal metadata when the worker completes between job lookup and state lookup', async () => {
        const initial = {
            id: 'job-1',
            data: { organizationId: 'org-1', step: BatchJobStep.WaitForChildren },
            getState: jest.fn().mockResolvedValue('completed'),
            returnvalue: undefined,
        }
        const completed = {
            ...initial,
            data: { organizationId: 'org-1', step: BatchJobStep.Finish },
            returnvalue: 's3://bucket/results/file.csv',
        }
        queue.getJob.mockResolvedValueOnce(initial).mockResolvedValueOnce(completed)

        const handle = await jobs.find('job-1')

        await expect(handle?.readStatus()).resolves.toEqual({
            state: 'completed',
            resultLocation: 's3://bucket/results/file.csv',
        })
        expect(handle?.data).toBe(completed.data)
    })

    it('refreshes the last attempt failure marker before reporting a terminal failure', async () => {
        const initial = { id: 'job-1', data: {}, getState: jest.fn().mockResolvedValue('failed') }
        queue.getJob
            .mockResolvedValueOnce(initial)
            .mockResolvedValueOnce({ ...initial, data: { failureCode: 'insufficient_credits' } })

        const handle = await jobs.find('job-1')

        await expect(handle?.readStatus()).resolves.toEqual({ state: 'failed', failureCode: 'insufficient_credits' })
    })

    it('reports unavailable if a terminal job disappears during the metadata refresh', async () => {
        queue.getJob
            .mockResolvedValueOnce({ data: {}, getState: jest.fn().mockResolvedValue('completed') })
            .mockResolvedValueOnce(undefined)

        const handle = await jobs.find('job-1')

        await expect(handle?.readStatus()).resolves.toEqual({ state: 'unavailable' })
    })

    it('returns a handle whose fields delegate to the underlying job', async () => {
        const updateData = jest.fn().mockResolvedValue(undefined)
        const rawJob = {
            id: 'job-1',
            data: {
                step: BatchJobStep.Validate,
                bucket: 'bucket',
                key: 'key',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            },
            queueQualifiedName: 'bull:batch-email-verification',
            attemptsMade: 2,
            getState: jest.fn().mockResolvedValue('active'),
            getDependenciesCount: jest.fn().mockResolvedValue({ processed: 3, unprocessed: 1 }),
            returnvalue: 's3://bucket/results/file.csv',
            updateData,
        }
        queue.getJob.mockResolvedValueOnce(rawJob)

        const handle = await jobs.find('job-1')

        expect(handle).toBeDefined()
        expect(handle?.id).toBe('job-1')
        expect(handle?.queueQualifiedName).toBe('bull:batch-email-verification')
        expect(handle?.attemptsMade).toBe(2)
        expect(handle?.data).toBe(rawJob.data)
        await expect(handle?.readStatus()).resolves.toEqual({ state: 'running' })
        await expect(handle?.counts()).resolves.toEqual({ processed: 3, unprocessed: 1 })

        const next: BatchJobData = {
            step: BatchJobStep.Process,
            bucket: 'bucket',
            key: 'key',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        }
        await handle?.updateStep(next)
        expect(updateData).toHaveBeenCalledWith(next)
    })
})
