import type { Redis } from 'ioredis'
import type { EmailVerificationResult } from './dto'
import { Queue } from 'bullmq'
import { RESOURCE } from './constants'
import { ok } from 'node:assert'

type DataType = string[]

type ResultType = EmailVerificationResult[]

type NameType = 'verifyBulk'

export class EmailVerificationQueue {
    private readonly queue

    constructor(connection: Redis) {
        this.queue = new Queue<DataType, ResultType, NameType>(RESOURCE, {
            connection,
        })
    }

    async addJob(name: NameType, data: DataType): Promise<string> {
        const { id } = await this.queue.add(name, data)
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<string> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return await job.getState()
    }

    async getResult(id: string): Promise<ResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new Error(`The job ${id} does not exist`))
        return job.returnvalue
    }
}
