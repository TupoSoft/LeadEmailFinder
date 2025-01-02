import type { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { LEAD_QUEUE_NAME } from './constants'
import { join } from 'node:path'
import { env } from 'node:process'

const { NODE_ENV } = env

export class LeadQueueWorker {
    private readonly worker

    constructor(connection: Redis) {
        const processorFileName = `queue-worker-processor.${NODE_ENV === 'production' ? 'js' : 'ts'}`
        this.worker = new Worker(LEAD_QUEUE_NAME, join(__dirname, processorFileName), {
            connection,
            autorun: false,
            useWorkerThreads: true,
        })
    }

    async run(): Promise<void> {
        await this.worker.run()
    }
}
