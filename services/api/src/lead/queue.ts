import type { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FindLeadRequest, FindLeadResult } from './dto'
import { ok } from 'node:assert'
import { SERVICE_NAME } from './constants'
import { randomUUID } from 'node:crypto'
import { bulkProgressResponseValidationSchema, type BulkStatusResponse } from '../common'

export type LeadQueueJobDataType = FindLeadRequest[]

export type LeadQueueResultType = FindLeadResult[]

export type LeadQueueNameType = 'findBulk'

export class LeadQueue {
    private readonly queue

    constructor(connection: Redis) {
        this.queue = new Queue<LeadQueueJobDataType, LeadQueueResultType, LeadQueueNameType>(SERVICE_NAME, {
            connection,
        })
    }

    async addJob(name: LeadQueueNameType, data: LeadQueueJobDataType): Promise<string> {
        const { id } = await this.queue.add(name, data, { jobId: randomUUID() })
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<BulkStatusResponse> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        const status = await job.getState()

        const { progress } = job
        const { total, processed } = await bulkProgressResponseValidationSchema.parseAsync(progress)

        return {
            status,
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
