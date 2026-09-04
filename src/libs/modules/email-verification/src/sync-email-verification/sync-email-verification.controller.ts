import type { Request } from 'express'
import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
import { Body, Controller, Req, Inject, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from '../api/email-verification-response.dto'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './email-verification.constants'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

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
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request?: Request,
    ): Promise<EmailVerificationResponseDto> {
        return await this.emailVerificationService.verify({
            organizationId: principal.organizationId,
            ...(typeof request?.id === 'string' ? { trace: { operationId: request.id, mode: 'sync' } } : {}),
            email: emailVerificationRequest.email,
        })
    }
}
