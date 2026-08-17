import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
    parseTimeString,
} from '@tuposoft/lead-email-finder/common'
import { Inject } from '@nestjs/common'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './async-email-verification.constants'
import { GreylistedException } from './greylisted.exception'

@Processor('async-email-verification', {
    settings: {
        backoffStrategy: (attemptsMade, type, err) => {
            if (type === 'async-email-verification') {
                if (err instanceof GreylistedException) {
                    return attemptsMade * parseTimeString('1m')
                }

                return parseTimeString('10s')
            }

            throw new Error(`Unknown type: ${type}`)
        },
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
        // job.data carries organizationId/credentialId beyond VerifyOptions; verify() only reads the
        // VerifyOptions fields it declares, so passing the wider object through is safe and avoids an
        // unused-variable destructure.
        const response = await this.emailVerificationService.verify(job.data)

        if (response.reason === EmailVerificationReason.TemporarilyBlocked) {
            throw new GreylistedException(response.email)
        }

        return response
    }
}
