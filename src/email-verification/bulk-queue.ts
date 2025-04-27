import type { EmailVerificationResult } from './dto'
import type { FlowChildJob, FlowProducer } from 'bullmq'
import { ok } from 'node:assert'
import type { BulkStatusResponse, Queue } from '../common'
import { jobStateToJobStatus } from '../common'
import { randomUUID } from 'node:crypto'

export type EmailVerificationQueueDataType = string[]

export type EmailVerificationQueueResultType = EmailVerificationResult[]

export type EmailVerificationQueueNameType = 'bulk-verification'

export interface BulkEmailVerificationQueue
    extends Queue<
        EmailVerificationQueueDataType,
        EmailVerificationQueueResultType,
        EmailVerificationQueueNameType,
        BulkStatusResponse
    > {}

export class BullBulkEmailVerificationQueue implements BulkEmailVerificationQueue {
    constructor(private readonly flowProducer: FlowProducer) {}

    async addJob(name: EmailVerificationQueueNameType, data: EmailVerificationQueueDataType): Promise<string> {
        const childrenPromises: FlowChildJob[] = data.map(
            email =>
                ({
                    queueName: 'verification',
                    name: email,
                    data: {
                        email,
                    },
                    opts: { jobId: randomUUID() },
                }) satisfies FlowChildJob,
        )

        const children = await Promise.all(childrenPromises)

        const {
            job: { id },
        } = await this.flowProducer.add({
            name,
            data,
            queueName: name,
            opts: { jobId: randomUUID() },
            children,
        })

        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<BulkStatusResponse> {
        const flow = await this.flowProducer.getFlow({ id, queueName: 'bulk-verification' })
        const { job } = flow
        const none = 0
        const { processed = none, unprocessed = none } = await job.getDependenciesCount()
        const state = await job.getState()
        const total = processed + unprocessed

        return {
            status: jobStateToJobStatus(state),
            total,
            processed,
        }
    }

    async getResult(id: string): Promise<EmailVerificationQueueResultType> {
        const flow = await this.flowProducer.getFlow({ id, queueName: 'bulk-verification' })
        const { job } = flow
        return job.returnvalue as EmailVerificationQueueResultType
    }
}
