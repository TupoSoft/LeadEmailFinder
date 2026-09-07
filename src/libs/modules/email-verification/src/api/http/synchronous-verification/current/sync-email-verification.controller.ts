import type { Request } from 'express'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
} from '../../../../application/delivery/synchronous/run-synchronous-verification'
import { Body, Controller, Req, Inject, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from '../../../email-verification-response.dto'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

@UseGuards(PermissionsGuard)
@RequirePermissions('verification:run')
@Controller('verify')
export class SyncEmailVerificationController {
    constructor(
        @Inject(RUN_SYNCHRONOUS_VERIFICATION)
        private readonly synchronousVerification: Pick<RunSynchronousVerification, 'execute'>,
    ) {}

    @Post()
    @UseGuards(CreditGuard)
    @SerializeOptions({ type: EmailVerificationResponseDto })
    async verifyEmail(
        @Body() emailVerificationRequest: EmailVerificationRequestDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request?: Request,
    ): Promise<EmailVerificationResponseDto> {
        return await this.synchronousVerification.execute({
            organizationId: principal.organizationId,
            ...(typeof request?.id === 'string' ? { trace: { operationId: request.id, mode: 'sync' } } : {}),
            email: emailVerificationRequest.email,
        })
    }
}
