import type { EmailVerificationResult } from './dto'
import type { Queue } from 'bullmq'
import { ok } from 'node:assert'
import { JobNotFoundError } from './errors'
import { randomUUID } from 'node:crypto'
import { bulkProgressResponseValidationSchema } from '../common'
import type { BulkStatusResponse } from '../common/dto'

type DataType = string[]

type ResultType = EmailVerificationResult[]

type NameType = 'verifyBulk'

export class EmailVerificationQueue {
    constructor(private readonly queue: Queue<DataType, ResultType, NameType>) {}

    async addJob(name: NameType, data: DataType): Promise<string> {
        const { id } = await this.queue.add(name, data, { jobId: randomUUID() })
        ok(id !== undefined, new Error('The job ID is undefined'))
        return id
    }

    async getStatus(id: string): Promise<BulkStatusResponse> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        const status = await job.getState()
        const { progress } = job
        const { total, processed } = await bulkProgressResponseValidationSchema.parseAsync(progress)

        return {
            status,
            total,
            processed,
        }
    }

    async getResult(id: string): Promise<ResultType> {
        const job = await this.queue.getJob(id)
        ok(job !== undefined, new JobNotFoundError(id))
        return job.returnvalue
    }
}
