import { Body, Controller, Get, Param, Post, Put, SerializeOptions, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { CreditsService } from '../application/credits.service'
import { AddCreditsDto, CreditResponseDto, CreditsAccountParamsDto, SetBalanceDto } from './credits.dto'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { randomUUID } from 'node:crypto'

@UseGuards(PermissionsGuard)
@RequirePermissions('platform:admin')
@ApiExcludeController()
@Controller('credits')
export class CreditsController {
    constructor(private readonly creditsService: CreditsService) {}

    @Get(':organizationId')
    @SerializeOptions({ type: CreditResponseDto })
    async getBalance(@Param() { organizationId }: CreditsAccountParamsDto): Promise<CreditResponseDto> {
        const balance = await this.creditsService.getBalance(organizationId)
        return { balance }
    }

    @Post(':organizationId')
    @SerializeOptions({ type: CreditResponseDto })
    async addCredits(
        @Param() { organizationId }: CreditsAccountParamsDto,
        @Body() { amount }: AddCreditsDto,
    ): Promise<CreditResponseDto> {
        const balance = await this.creditsService.credit(organizationId, amount, randomUUID())
        return { balance }
    }

    @Put(':organizationId')
    @SerializeOptions({ type: CreditResponseDto })
    async setBalance(
        @Param() { organizationId }: CreditsAccountParamsDto,
        @Body() { amount }: SetBalanceDto,
    ): Promise<CreditResponseDto> {
        const balance = await this.creditsService.setBalance(organizationId, amount)
        return { balance }
    }
}
