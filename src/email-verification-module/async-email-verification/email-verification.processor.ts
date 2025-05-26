import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
    parseTimeString,
} from '../../common'
import { Inject } from '@nestjs/common'
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
export class EmailVerificationProcessor extends WorkerHost {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {
        super()
    }

    async process(job: Job<string, IEmailVerificationResponseDto>): Promise<IEmailVerificationResponseDto> {
        const { data: email } = job

        const response = await this.emailVerificationService.verify({ email })

        if (response.reason === EmailVerificationReason.TemporarilyBlocked) {
            throw new GreylistedException(email)
        }

        return response
    }
}
