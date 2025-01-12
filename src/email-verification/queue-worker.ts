import type { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { IEmailVerifier } from './verifier'
import { RESOURCE } from './constants'

const PERCENTAGE = 100
const CONCURRENCY = 50

export class EmailVerificationQueueWorker {
    private readonly worker

    constructor(connection: Redis, emailVerifier: IEmailVerifier) {
        this.worker = new Worker<EmailVerificationRequest[], EmailVerificationResult[]>(
            RESOURCE,
            async job => {
                const { data: emailVerificationRequests } = job

                const emailVerificationResults: EmailVerificationResult[] = []
                for (const emailVerificationRequest of emailVerificationRequests) {
                    const result = await emailVerifier.verify(emailVerificationRequest)
                    emailVerificationResults.push(result)
                    await job.updateProgress(
                        (emailVerificationResults.length / emailVerificationResults.length) * PERCENTAGE,
                    )
                }

                return emailVerificationResults
            },
            {
                connection,
                concurrency: CONCURRENCY,
                autorun: false,
            },
        )
    }

    async run(): Promise<void> {
        await this.worker.run()
    }
}
