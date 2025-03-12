import type { EmailVerificationResult } from './dto'
import type { Queue as BullQueue } from 'bullmq'
import { ok } from 'node:assert'
import { JobNotFoundError } from './errors'
import { randomUUID } from 'node:crypto'
import type { BulkStatusResponse, Queue } from '../common'
import { bulkProgressResponseValidationSchema, jobStateToJobStatus } from '../common'

export type EmailVerificationQueueDataType = string[]

export type EmailVerificationQueueResultType = EmailVerificationResult[]

export type EmailVerificationQueueNameType = 'verifyBulk'

export interface BulkEmailVerificationQueue
    extends Queue<
        EmailVerificationQueueDataType,
        EmailVerificationQueueResultType,
        EmailVerificationQueueNameType,
        BulkStatusResponse
    > {}

export class BullBulkEmailVerificationQueue implements BulkEmailVerificationQueue {
    constructor(
        private readonly queue: BullQueue<
            EmailVerificationQueueDataType,
            EmailVerificationQueueResultType,
            EmailVerificationQueueNameType
        >,
    ) {}

    async addJob(name: EmailVerificationQueueNameType, data: EmailVerificationQueueDataType): Promise<string> {
        const { id } = await this.queue.add(name, data, { jobId: randomUUID() })
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<BulkStatusResponse> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        const state = await job.getState()

        const { progress } = job
        const { total, processed } = await bulkProgressResponseValidationSchema.parseAsync(progress)

        return {
            status: jobStateToJobStatus(state),
            total,
            processed,
        }
    }

    async getResult(id: string): Promise<EmailVerificationQueueResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        return job.returnvalue
    }
}
