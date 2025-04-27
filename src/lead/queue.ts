import type { FindLeadRequest, FindLeadResult } from './dto'
import { ok } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { bulkProgressResponseValidationSchema, type BulkStatusResponse, jobStateToJobStatus } from '../common'
import type { FlowProducer } from 'bullmq'

export type LeadQueueJobDataType = FindLeadRequest[]

export type LeadQueueResultType = FindLeadResult[]

export type LeadQueueNameType = 'findBulk'

export class LeadQueue {
    constructor(private readonly flowProducer: FlowProducer) {}

    async addJob(name: LeadQueueNameType, data: LeadQueueJobDataType): Promise<string> {
        const { id } = await this.queue.add(name, data, { jobId: randomUUID() })
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<BulkStatusResponse> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        const state = await job.getState()

        const { progress } = job
        const { total, processed } = await bulkProgressResponseValidationSchema.parseAsync(progress)

        return {
            status: jobStateToJobStatus(state),
            total,
            processed,
        }
    }

    async getResult(id: string): Promise<LeadQueueResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return job.returnvalue
    }
}
