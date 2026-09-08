import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { BatchJobData } from '../../../domain/batch-job'
import { BatchJobHandle, BatchJobs, NewBatchJob } from '../../../application/delivery/batch/batch-jobs'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification-queue.config'
import { BatchTerminalFailureCode } from '../../../application/delivery/batch/batch-terminal-failure'
import { normalizeVerificationJobState } from '../normalize-verification-job-state'
import { parseS3ResultLocation } from '../../storage/batch-verification/parse-s3-result-location'

export type BatchQueueJobData = BatchJobData & { failureCode?: BatchTerminalFailureCode }

function retainedResultLocation(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    try {
        parseS3ResultLocation(value)
        return value
    } catch {
        return undefined
    }
}

function toHandle(
    initialJob: Job<BatchQueueJobData, string>,
    // Worker handles already own their attempt's data. Public lookup always supplies a fresh queue read.
    reload: () => Promise<Job<BatchQueueJobData, string> | undefined> = () => Promise.resolve(initialJob),
): BatchJobHandle {
    let job = initialJob
    return {
        id: job.id as string,
        get data() {
            return job.data
        },
        queueQualifiedName: job.queueQualifiedName,
        get attemptsMade() {
            return job.attemptsMade ?? 0
        },
        readStatus: async () => {
            const state = normalizeVerificationJobState(await job.getState())
            if (state === 'completed' || state === 'failed') {
                // getState reads Redis, but returnvalue/data on an earlier Job instance are snapshots.
                // Refresh after observing a terminal state so a just-finished job exposes its result/marker
                // and the subsequent count read uses its latest workflow step.
                const latest = await reload()
                if (!latest) return { state: 'unavailable' }
                job = latest
            }
            if (state === 'completed') return { state, resultLocation: retainedResultLocation(job.returnvalue) }
            if (state === 'failed') return { state, failureCode: job.data.failureCode }
            return { state }
        },
        counts: async () => {
            const { processed = 0, unprocessed = 0 } = await job.getDependenciesCount()
            return { processed, unprocessed }
        },
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

        return toHandle(job, () => this.queue.getJob(id))
    }
}

export { toHandle as batchJobHandleFromJob }
