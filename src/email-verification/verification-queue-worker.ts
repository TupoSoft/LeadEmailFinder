import type { Redis } from 'ioredis'
import type { EmailVerificationService } from './service'
import { Worker } from 'bullmq'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import { QUEUE_WORKER_CONCURRENCY } from '../common'

export class EmailVerificationQueueWorker {
    private readonly worker

    constructor(connection: Redis, emailVerificationService: EmailVerificationService) {
        this.worker = new Worker<EmailVerificationRequest, EmailVerificationResult>(
            'verification',
            async job => {
                const { data: emailVerificationRequest } = job

                return await emailVerificationService.verify(emailVerificationRequest)
            },
            {
                connection,
                concurrency: QUEUE_WORKER_CONCURRENCY,
                autorun: false,
            },
        )
    }

    async run(): Promise<void> {
        await this.worker.run()
    }
}
