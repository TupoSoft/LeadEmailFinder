import type { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import type { EmailVerificationResult } from './dto'
import type { IEmailVerificationRunner } from './runner'
import { RESOURCE } from './constants'
import { PERCENTAGE, QUEUE_WORKER_CONCURRENCY } from '../common'

export class EmailVerificationQueueWorker {
    private readonly worker

    constructor(connection: Redis, emailVerifier: IEmailVerificationRunner) {
        this.worker = new Worker<string[], EmailVerificationResult[]>(
            RESOURCE,
            async job => {
                const { data: emails } = job

                const emailVerificationResults: EmailVerificationResult[] = []
                for (const email of emails) {
                    const result = await emailVerifier.verify({ email })
                    emailVerificationResults.push(result)
                    await job.updateProgress(
                        (emailVerificationResults.length / emailVerificationResults.length) * PERCENTAGE,
                    )
                }

                return emailVerificationResults
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
