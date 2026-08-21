import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
import { Body, Controller, Inject, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from './email-verification-response.dto'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'

@UseGuards(PermissionsGuard)
@RequirePermissions('verification:run')
@Controller('verify')
export class SyncEmailVerificationController {
    constructor(
        @Inject(EMAIL_VERIFICATION_SERVICE_TOKEN) private readonly emailVerificationService: IEmailVerificationService,
    ) {}

    @Post()
    @UseGuards(CreditGuard)
    @SerializeOptions({ type: EmailVerificationResponseDto })
    async verifyEmail(
        @Body() emailVerificationRequest: EmailVerificationRequestDto,
    ): Promise<EmailVerificationResponseDto> {
        return await this.emailVerificationService.verify(emailVerificationRequest)
    }
}
