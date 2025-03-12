import type { Redis } from 'ioredis'
import type { EmailVerificationService } from './service'
import { Worker } from 'bullmq'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'

export class VerificationQueueWorker {
    private readonly worker

    constructor(connection: Redis, emailVerificationService: EmailVerificationService) {
        this.worker = new Worker<EmailVerificationRequest, EmailVerificationResult>(
            'verification',
            async (job, token) => {
                const { data: emailVerificationRequest } = job

                return await emailVerificationService.verify(emailVerificationRequest)
            },
            {
                connection,
            },
        )
    }
}
