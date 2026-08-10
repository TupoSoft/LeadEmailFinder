import { Body, Controller, Get, Param, Post, Put, SerializeOptions, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { CreditsService } from './credits.service'
import { AddCreditsDto, CreditResponseDto, SetBalanceDto } from './credits.dto'
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/modules/api-key'
import { RequireApiPermissions } from '@tuposoft/lead-email-finder/modules/api-key/application/decorators'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key/domain/key.enum'

@UseGuards(ApiKeyGuard)
@RequireApiPermissions(KeyPermissions.ADMIN)
@ApiExcludeController()
@Controller('credits')
export class CreditsController {
    constructor(private readonly creditsService: CreditsService) {}

    @Get(':apiKey')
    @SerializeOptions({ type: CreditResponseDto })
    async getBalance(@Param('apiKey') apiKey: string): Promise<CreditResponseDto> {
        const balance = await this.creditsService.getBalance(apiKey)
        return { balance }
    }

    @Post(':apiKey')
    @SerializeOptions({ type: CreditResponseDto })
    async addCredits(@Param('apiKey') apiKey: string, @Body() { amount }: AddCreditsDto): Promise<CreditResponseDto> {
        const balance = await this.creditsService.addCredits(apiKey, amount)
        return { balance }
    }

    @Put(':apiKey')
    @SerializeOptions({ type: CreditResponseDto })
    async setBalance(@Param('apiKey') apiKey: string, @Body() { amount }: SetBalanceDto): Promise<CreditResponseDto> {
        const balance = await this.creditsService.setBalance(apiKey, amount)
        return { balance }
    }
}
