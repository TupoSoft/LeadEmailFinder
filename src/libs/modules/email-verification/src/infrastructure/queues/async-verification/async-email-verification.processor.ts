import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
} from '@tuposoft/lead-email-finder/common'
import { Inject } from '@nestjs/common'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import {
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
    asyncEmailVerificationBackoff,
} from './async-email-verification-queue.config'
import { GreylistedException } from './greylisted.exception'

@Processor(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME, {
    settings: {
        backoffStrategy: asyncEmailVerificationBackoff,
    },
})
export class AsyncEmailVerificationProcessor extends WorkerHost {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {
        super()
    }

    async process(
        job: Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>,
    ): Promise<IEmailVerificationResponseDto> {
        const { organizationId, email, format, batchId } = job.data
        const response = await this.emailVerificationService.verify({
            organizationId,
            email,
            format,
            batchId,
            trace: job.id
                ? {
                      operationId: job.id,
                      mode: batchId ? 'batch_child' : 'async',
                      jobId: job.id,
                      ...(batchId ? { batchId } : {}),
                      attempt: Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, (job.attemptsMade ?? 0) + 1)),
                  }
                : undefined,
        })

        if (response.reason === EmailVerificationReason.TemporarilyBlocked) {
            throw new GreylistedException(response.email)
        }

        return response
    }
}
