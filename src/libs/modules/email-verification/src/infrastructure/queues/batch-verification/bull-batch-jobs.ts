import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { BatchJobData } from '../../../domain/batch-job'
import { BatchJobHandle, BatchJobs, NewBatchJob } from '../../../application/delivery/batch/batch-jobs'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'

function toHandle(job: Job<BatchJobData, string>): BatchJobHandle {
    return {
        id: job.id as string,
        get data() {
            return job.data
        },
        queueQualifiedName: job.queueQualifiedName,
        get attemptsMade() {
            return job.attemptsMade ?? 0
        },
        state: () => job.getState(),
        counts: async () => {
            const { processed = 0, unprocessed = 0 } = await job.getDependenciesCount()
            return { processed, unprocessed }
        },
        returnValue: () => Promise.resolve(job.returnvalue),
        updateStep: (next: BatchJobData) => job.updateData(next),
    }
}

@Injectable()
export class BullBatchJobs implements BatchJobs {
    constructor(
        @InjectQueue(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
        private readonly queue: Queue<BatchJobData, string>,
    ) {}

    async enqueue(data: NewBatchJob, jobId: string): Promise<{ id?: string }> {
        const { id } = await this.queue.add(BATCH_EMAIL_VERIFICATION_QUEUE_NAME, data, { jobId })
        return { id }
    }

    async find(id: string): Promise<BatchJobHandle | undefined> {
        const job = await this.queue.getJob(id)
        if (!job) return undefined

        return toHandle(job)
    }
}

export { toHandle as batchJobHandleFromJob }
