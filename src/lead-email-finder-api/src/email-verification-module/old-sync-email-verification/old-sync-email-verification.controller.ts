import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common'
import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
import { OldSyncEmailVerificationResponseDto } from './old-sync-email-verification-response.dto'
import { OldSyncEmailVerificationRequestQueryDto } from './old-sync-email-verification-request-query.dto'
import { ApiOperation } from '@nestjs/swagger'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { EmailVerificationResponseDto } from '../sync-email-verification'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'

@UseGuards(PermissionsGuard)
@RequirePermissions('verification:read')
@Controller('verify')
export class OldSyncEmailVerificationController {
    constructor(
        @Inject('EmailVerificationServiceToken') private readonly emailVerificationService: IEmailVerificationService,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    @Get()
    @ApiOperation({ deprecated: true })
    async verifyEmail(
        @Query() emailVerificationRequestDto: OldSyncEmailVerificationRequestQueryDto,
    ): Promise<OldSyncEmailVerificationResponseDto> {
        const result = await this.emailVerificationService.verify(emailVerificationRequestDto)
        return this.mapper.map(result, EmailVerificationResponseDto, OldSyncEmailVerificationResponseDto)
    }
}
