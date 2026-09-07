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
import {
    ApiBadGatewayResponse,
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiOperation,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPurchaseService, PaymentCheckoutError } from '../../application/credit-purchase.service'
import { CreditPackNotFoundError } from '../../domain/credit-pack'
import {
    CreateCreditPurchaseDto,
    CreateCreditPurchaseResponseDto,
    CreditPurchaseResponseDto,
} from './credit-purchase.dto'

@ApiTags('Billing')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'The required billing permission is missing' })
@UseGuards(PermissionsGuard)
@Controller('v1/credit-purchases')
export class CreditPurchaseController {
    constructor(private readonly purchases: CreditPurchaseService) {}

    @Post()
    @ApiCreatedResponse({ type: CreateCreditPurchaseResponseDto })
    @ApiBadRequestResponse({ description: 'The selected credit pack is unavailable or the request is invalid' })
    @ApiBadGatewayResponse({ description: 'Checkout could not be created safely' })
    @RequirePermissions('billing:manage')
    @ApiOperation({
        description:
            'Starts a purchase for the authenticated organization. Browser sessions require a matching application Origin (or Referer) and the decoded lef_csrf_token cookie in x-csrf-token. OIDC bearer credentials are also supported.',
        security: [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }],
    })
    @ApiHeader({
        name: 'Origin',
        required: false,
        description:
            'Cookie-authenticated requests must match the application origin. A same-origin Referer is accepted when Origin is absent.',
        schema: { type: 'string', format: 'uri' },
    })
    @ApiHeader({
        name: 'Referer',
        required: false,
        description: 'Fallback URL for checking the application origin on cookie-authenticated requests.',
        schema: { type: 'string', format: 'uri' },
    })
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
    @ApiOkResponse({ type: CreditPurchaseResponseDto, isArray: true })
    @RequirePermissions('billing:read')
    @ApiOperation({ security: [{ lef_session: [] }, { oidc: [] }] })
    @SerializeOptions({ type: CreditPurchaseResponseDto })
    async list(@CurrentPrincipal() principal: AuthPrincipal): Promise<CreditPurchaseResponseDto[]> {
        const purchases = await this.purchases.listForOrganization(principal.organizationId)
        return purchases.map(({ id, packId, credits, amountMinor, currency, status, createdAt, updatedAt }) => ({
            id,
            packId,
            credits,
            amountMinor,
            currency,
            status,
            createdAt,
            updatedAt,
        }))
    }
}
