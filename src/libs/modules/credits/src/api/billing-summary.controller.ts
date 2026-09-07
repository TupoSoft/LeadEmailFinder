import { Controller, Get, SerializeOptions, UseGuards } from '@nestjs/common'
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '../application/credits.service'
import { CreditResponseDto } from './credits.dto'

@ApiTags('Billing')
@UseGuards(PermissionsGuard)
@Controller('v1/billing/summary')
export class BillingSummaryController {
    constructor(private readonly credits: CreditsService) {}

    @Get()
    @RequirePermissions('billing:read')
    @ApiOperation({ security: [{ lef_session: [] }, { oidc: [] }] })
    @ApiOkResponse({ type: CreditResponseDto })
    @ApiUnauthorizedResponse({ description: 'Authentication is required' })
    @ApiForbiddenResponse({ description: 'Billing read permission is required' })
    @SerializeOptions({ type: CreditResponseDto })
    async getSummary(@CurrentPrincipal() principal: AuthPrincipal): Promise<CreditResponseDto> {
        return { balance: await this.credits.getBalance(principal.organizationId) }
    }
}
