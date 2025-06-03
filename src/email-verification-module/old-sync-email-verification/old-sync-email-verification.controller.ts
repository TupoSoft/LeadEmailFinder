import { Controller, Get, Inject, Query } from '@nestjs/common'
import { IEmailVerificationService } from '../../common'
import { OldSyncEmailVerificationResponseDto } from './old-sync-email-verification-response.dto'
import { plainToInstance } from 'class-transformer'
import { OldSyncEmailVerificationRequestQueryDto } from './old-sync-email-verification-request-query.dto'
import { ApiOperation } from '@nestjs/swagger'

@Controller('verify')
export class OldSyncEmailVerificationController {
    constructor(
        @Inject('EmailVerificationServiceToken') private readonly emailVerificationService: IEmailVerificationService,
    ) {}

    @Get()
    @ApiOperation({ deprecated: true })
    async verifyEmail(
        @Query() emailVerificationRequestDto: OldSyncEmailVerificationRequestQueryDto,
    ): Promise<OldSyncEmailVerificationResponseDto> {
        const result = await this.emailVerificationService.verify(emailVerificationRequestDto)
        return plainToInstance(OldSyncEmailVerificationResponseDto, result)
    }
}
