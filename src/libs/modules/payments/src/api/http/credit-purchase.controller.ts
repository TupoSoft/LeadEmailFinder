import {
    BadGatewayException,
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPurchaseService, PaymentCheckoutError } from '../../application/credit-purchase.service'
import { CreditPackNotFoundError } from '../../domain/credit-pack'
import {
    CreateCreditPurchaseDto,
    CreateCreditPurchaseResponseDto,
    CreditPurchaseResponseDto,
} from './credit-purchase.dto'

@UseGuards(PermissionsGuard)
@Controller('v1/credit-purchases')
export class CreditPurchaseController {
    constructor(private readonly purchases: CreditPurchaseService) {}

    @Post()
    @RequirePermissions('billing:manage')
    @SerializeOptions({ type: CreateCreditPurchaseResponseDto })
    async create(
        @Body() { packId }: CreateCreditPurchaseDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<CreateCreditPurchaseResponseDto> {
        try {
            const { purchase, redirectUrl } = await this.purchases.start(principal, packId)
            return { id: purchase.id, status: purchase.status, redirectUrl }
        } catch (error) {
            if (error instanceof CreditPackNotFoundError) {
                throw new BadRequestException(error.message)
            }
            if (error instanceof PaymentCheckoutError) {
                throw new BadGatewayException(error.message)
            }
            throw error
        }
    }

    @Get()
    @RequirePermissions('billing:read')
    @SerializeOptions({ type: CreditPurchaseResponseDto })
    list(@CurrentPrincipal() principal: AuthPrincipal): Promise<CreditPurchaseResponseDto[]> {
        return this.purchases.listForOrganization(principal.organizationId)
    }
}
