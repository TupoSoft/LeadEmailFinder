import { Controller, Get, SerializeOptions, UseGuards } from '@nestjs/common'
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPackCatalog } from '../../application/credit-pack-catalog'
import { BillingCreditPackResponseDto } from './billing-credit-packs.dto'

@ApiTags('Billing')
@UseGuards(PermissionsGuard)
@Controller('v1/billing/credit-packs')
export class BillingCreditPacksController {
    constructor(private readonly catalog: CreditPackCatalog) {}

    @Get()
    @RequirePermissions('billing:read')
    @ApiOperation({ security: [{ lef_session: [] }, { oidc: [] }] })
    @ApiOkResponse({ type: BillingCreditPackResponseDto, isArray: true })
    @ApiUnauthorizedResponse({ description: 'Authentication is required' })
    @ApiForbiddenResponse({ description: 'Billing read permission is required' })
    @SerializeOptions({ type: BillingCreditPackResponseDto })
    list(): readonly BillingCreditPackResponseDto[] {
        return this.catalog.listForCustomer()
    }
}
