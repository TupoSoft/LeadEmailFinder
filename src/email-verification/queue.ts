import type { EmailVerificationResult } from './dto'
import type { Queue } from 'bullmq'
import { ok } from 'node:assert'
import { JobNotFoundError } from './errors'

type DataType = string[]

type ResultType = EmailVerificationResult[]

type NameType = 'verifyBulk'

export class EmailVerificationQueue {
    constructor(private readonly queue: Queue<DataType, ResultType, NameType>) {}

    async addJob(name: NameType, data: DataType): Promise<string> {
        const { id } = await this.queue.add(name, data)
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<string> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        return await job.getState()
    }

    async getResult(id: string): Promise<ResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        return job.returnvalue
    }
}
