import type { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { LEAD_QUEUE_NAME } from './constants'
import { join } from 'node:path'

export class LeadQueueWorker {
    private readonly worker

    constructor(connection: Redis) {
        this.worker = new Worker(LEAD_QUEUE_NAME, join(__dirname, `queue-worker-processor.ts`), {
            connection,
            autorun: false,
            useWorkerThreads: true,
        })
    }

    async run(): Promise<void> {
        await this.worker.run()
    }
}
