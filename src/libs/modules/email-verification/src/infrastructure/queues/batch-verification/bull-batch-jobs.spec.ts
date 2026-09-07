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
            providers: [BullBatchJobs, { provide: getQueueToken(BATCH_EMAIL_VERIFICATION_QUEUE_NAME), useValue: queue }],
        }).compile()

        jobs = module.get(BullBatchJobs)
    })

    it('enqueues a new batch job at the Validate step under the queue name', async () => {
        queue.add.mockResolvedValueOnce({ id: 'job-1' })

        const result = await jobs.enqueue(
            { step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' },
            'job-1',
        )

        expect(result).toEqual({ id: 'job-1' })
        expect(queue.add).toHaveBeenCalledWith(
            BATCH_EMAIL_VERIFICATION_QUEUE_NAME,
            { step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' },
            { jobId: 'job-1' },
        )
    })

    it('returns undefined when the job does not exist', async () => {
        queue.getJob.mockResolvedValueOnce(undefined)

        await expect(jobs.find('missing')).resolves.toBeUndefined()
    })

    it('returns a handle whose fields delegate to the underlying job', async () => {
        const updateData = jest.fn().mockResolvedValue(undefined)
        const rawJob = {
            id: 'job-1',
            data: { step: BatchJobStep.Validate, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' },
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
        await expect(handle?.state()).resolves.toBe('active')
        await expect(handle?.counts()).resolves.toEqual({ processed: 3, unprocessed: 1 })
        await expect(handle?.returnValue()).resolves.toBe('s3://bucket/results/file.csv')

        const next: BatchJobData = { step: BatchJobStep.Process, bucket: 'bucket', key: 'key', organizationId: 'org-1', credentialId: 'cred-1' }
        await handle?.updateStep(next)
        expect(updateData).toHaveBeenCalledWith(next)
    })
})
