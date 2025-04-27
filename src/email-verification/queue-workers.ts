import type { Redis } from 'ioredis'
import type { EmailVerificationService } from './service'
import { Worker } from 'bullmq'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import { isEmptyArray, QUEUE_WORKER_CONCURRENCY } from '../common'

export function startEmailVerificationQueueWorker(
    connection: Redis,
    emailVerificationService: EmailVerificationService,
): Worker {
    return new Worker<EmailVerificationRequest, EmailVerificationResult>(
        'verification',
        async job => {
            const { data: emailVerificationRequest } = job
            return await emailVerificationService.verify(emailVerificationRequest)
        },
        {
            connection,
            concurrency: QUEUE_WORKER_CONCURRENCY,
        },
    )
}

export function startBulkEmailVerificationQueueWorker(connection: Redis): Worker {
    return new Worker<string[], EmailVerificationResult[]>(
        'bulk-verification',
        async job => {
            const childrenValues = await job.getChildrenValues<EmailVerificationResult>()
            return Object.values(childrenValues)
        },
        {
            connection,
            concurrency: QUEUE_WORKER_CONCURRENCY,
        },
    )
}

export function startLeadEmailVerificationQueueWorker(
    connection: Redis,
    emailVerificationService: EmailVerificationService,
): Worker {
    return new Worker<EmailVerificationRequest, EmailVerificationResult>(
        'lead-email-verification',
        async job => {
            const { data } = job
            const children = await job.getChildrenValues<EmailVerificationResult>()
            const childrenValues = Object.values(children)

            if (!isEmptyArray(childrenValues)) {
                const [verificationResult] = childrenValues

                if (verificationResult.exists === true) {
                    return verificationResult
                }
            }

            return await emailVerificationService.verify(data)
        },
        {
            connection,
            concurrency: QUEUE_WORKER_CONCURRENCY,
        },
    )
}
