import { IEmailVerificationService } from '../../common'
import { Body, Controller, Inject, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from './email-verification-response.dto'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/key'

@UseGuards(ApiKeyGuard)
@Controller('verify')
export class SyncEmailVerificationController {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {}

    @Post()
    @SerializeOptions({ type: EmailVerificationResponseDto })
    async verifyEmail(
        @Body() emailVerificationRequest: EmailVerificationRequestDto,
    ): Promise<EmailVerificationResponseDto> {
        return await this.emailVerificationService.verify(emailVerificationRequest)
    }
}
