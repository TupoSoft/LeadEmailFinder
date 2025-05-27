import { Controller, Get, Inject, Query } from '@nestjs/common'
import { IEmailVerificationService } from '../../common'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from './email-verification-response.dto'

@Controller('verify')
export class EmailVerificationController {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {}

    @Get()
    async verifyEmail(
        @Query() emailVerificationRequestDto: EmailVerificationRequestDto,
    ): Promise<EmailVerificationResponseDto> {
        return await this.emailVerificationService.verify(emailVerificationRequestDto)
    }
}
