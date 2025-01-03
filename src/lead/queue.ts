import type { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import type { FindLeadRequest, FindLeadResult } from './dto'
import { ok } from 'node:assert'
import { SERVICE_NAME } from './constants'

export interface LeadQueueJobDataType {
    leads: FindLeadRequest[]
}

export interface LeadQueueResultType {
    findLeadResults: FindLeadResult[]
}

export type LeadQueueNameType = 'findBulk'

export class LeadQueue {
    private readonly queue

    constructor(connection: Redis) {
        this.queue = new Queue<LeadQueueJobDataType, LeadQueueResultType, LeadQueueNameType>(SERVICE_NAME, {
            connection,
        })
    }

    async addJob(name: LeadQueueNameType, data: LeadQueueJobDataType): Promise<string> {
        const { id } = await this.queue.add(name, data)
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<string> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return await job.getState()
    }

    async getResult(id: string): Promise<LeadQueueResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return job.returnvalue
    }
}
