import type { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FindLeadResult, Lead } from './dto'
import { ok } from 'node:assert'
import { LEAD_QUEUE_NAME } from './constants'

export interface FindLeadBulkDataType {
    leads: Lead[]
}

export interface FindLeadBulkResultType {
    findLeadResults: FindLeadResult[]
}

export type LeadQueueNameType = 'findBulk'

export class LeadQueue {
    private readonly queue

    constructor(connection: Redis) {
        this.queue = new Queue<FindLeadBulkDataType, FindLeadBulkResultType, LeadQueueNameType>(LEAD_QUEUE_NAME, {
            connection,
        })
    }

    async addJob(name: LeadQueueNameType, data: FindLeadBulkDataType): Promise<string> {
        const { id } = await this.queue.add(name, data)
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<string> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return await job.getState()
    }

    async getResult(id: string): Promise<FindLeadBulkResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return job.returnvalue
    }
}
