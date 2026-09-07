import type { Request } from 'express'
import { Controller, Req, Get, Inject, Query, UseGuards } from '@nestjs/common'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
} from '../../../../application/delivery/synchronous/run-synchronous-verification'
import { OldSyncEmailVerificationResponseDto } from './old-sync-email-verification-response.dto'
import { OldSyncEmailVerificationRequestQueryDto } from './old-sync-email-verification-request-query.dto'
import { ApiOperation } from '@nestjs/swagger'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { EmailVerificationResponseDto } from '../../../email-verification-response.dto'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

@UseGuards(PermissionsGuard)
@RequirePermissions('verification:run')
@Controller('verify')
export class OldSyncEmailVerificationController {
    constructor(
        @Inject(RUN_SYNCHRONOUS_VERIFICATION)
        private readonly synchronousVerification: Pick<RunSynchronousVerification, 'execute'>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    @Get()
    @UseGuards(CreditGuard)
    @ApiOperation({ deprecated: true })
    async verifyEmail(
        @Query() emailVerificationRequestDto: OldSyncEmailVerificationRequestQueryDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request?: Request,
    ): Promise<OldSyncEmailVerificationResponseDto> {
        const result = await this.synchronousVerification.execute({
            organizationId: principal.organizationId,
            ...(typeof request?.id === 'string' ? { trace: { operationId: request.id, mode: 'deprecated_sync' } } : {}),
            email: emailVerificationRequestDto.email,
        })
        return this.mapper.map(result, EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto)
    }
}
