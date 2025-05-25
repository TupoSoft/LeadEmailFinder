import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { IEmailVerificationResponseDto, IEmailVerificationService } from '../common'
import { Inject } from '@nestjs/common'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'

@Processor('email-verification')
export class EmailVerificationProcessor extends WorkerHost {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {
        super()
    }

    async process(job: Job<string, IEmailVerificationResponseDto>): Promise<IEmailVerificationResponseDto> {
        const { data: email } = job
        return await this.emailVerificationService.verify({ email })
    }
}
