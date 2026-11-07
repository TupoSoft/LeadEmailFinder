import {
    Body,
    ConflictException,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Req,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiOperation,
    ApiOkResponse,
    ApiInternalServerErrorResponse,
    ApiParam,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Request } from 'express'
import { CreditsService } from '../application/credits.service'
import { AddCreditsDto, CreditResponseDto, CreditsAccountParamsDto, SetBalanceDto } from './credits.dto'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { BalanceBelowReservedException, CreditIdempotencyConflict } from '../domain/credits.error'
import { parseCreditIdempotencyKey } from './credit-idempotency-key'

const SESSION_SECURITY: Record<string, string[]>[] = [{ lef_session: [] }, { oidc: [] }]
const MUTATION_SECURITY: Record<string, string[]>[] = [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }]

@UseGuards(PermissionsGuard)
@RequirePermissions('platform:admin')
@Controller('credits')
export class CreditsController {
    constructor(private readonly creditsService: CreditsService) {}

    @Get(':organizationId')
    @ApiOperation({
        operationId: 'CreditsController_getBalance',
        summary: 'Read the authoritative organization credit balance',
        description:
            'Requires platform:admin. Returns zero when no credit account exists; this does not prove organization existence.',
        security: SESSION_SECURITY,
    })
    @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
    @ApiOkResponse({ type: CreditResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid organization UUID.' })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication.' })
    @ApiForbiddenResponse({ description: 'Authenticated caller lacks platform:admin.' })
    @ApiInternalServerErrorResponse({ description: 'The balance could not be loaded.' })
    @SerializeOptions({ type: CreditResponseDto })
    async getBalance(@Param() { organizationId }: CreditsAccountParamsDto): Promise<CreditResponseDto> {
        const balance = await this.creditsService.getBalance(organizationId)
        return { balance }
    }

    @Post(':organizationId')
    @ApiOperation({
        operationId: 'CreditsController_addCredits',
        summary: 'Add platform credits idempotently',
        security: MUTATION_SECURITY,
        description:
            'Requires platform:admin. Cookie sessions require Origin and CSRF protection. Reuse one key for the same organization and amount to return the current balance without another grant. ' +
            'Reusing that key with a different amount returns 409 without changing the balance. ' +
            'Both the first successful request and an equivalent replay return 201.',
    })
    @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
    @ApiHeader({
        name: 'Idempotency-Key',
        required: true,
        description: 'Exactly one canonical lowercase UUID per logical credit addition; reuse it only for retries.',
        schema: { type: 'string', format: 'uuid' },
    })
    @ApiBody({ type: AddCreditsDto })
    @ApiCreatedResponse({
        type: CreditResponseDto,
        description: 'Grant applied or equivalent replay; current balance.',
    })
    @ApiBadRequestResponse({ description: 'Invalid organization, amount, or missing, repeated, or malformed key.' })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication.' })
    @ApiForbiddenResponse({ description: 'Authenticated caller lacks platform:admin.' })
    @ApiConflictResponse({ description: 'The organization and key already identify a grant with a different amount.' })
    @SerializeOptions({ type: CreditResponseDto })
    async addCredits(
        @Param() { organizationId }: CreditsAccountParamsDto,
        @Body() { amount }: AddCreditsDto,
        @Req() request: Request,
    ): Promise<CreditResponseDto> {
        const idempotencyKey = parseCreditIdempotencyKey(request.rawHeaders)

        try {
            const balance = await this.creditsService.addPlatformCredits(organizationId, amount, idempotencyKey)

            return { balance }
        } catch (error) {
            if (error instanceof CreditIdempotencyConflict) {
                throw new ConflictException(error.message)
            }
            throw error
        }
    }

    @Put(':organizationId')
    @ApiOperation({
        operationId: 'CreditsController_setBalance',
        summary: 'Set an absolute organization credit balance',
        description:
            'Requires platform:admin. Replaces the balance with the requested value. Cookie sessions require Origin and CSRF protection. Reload after uncertainty before another explicit set.',
        security: MUTATION_SECURITY,
    })
    @ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
    @ApiBody({ type: SetBalanceDto })
    @ApiOkResponse({ type: CreditResponseDto })
    @ApiBadRequestResponse({ description: 'Invalid organization UUID or nonnegative integer amount.' })
    @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication.' })
    @ApiForbiddenResponse({ description: 'Authenticated caller lacks platform:admin or browser CSRF check denied.' })
    @ApiConflictResponse({
        description: 'The requested balance is below credits already reserved for accepted operations.',
    })
    @ApiInternalServerErrorResponse({
        description: 'The outcome may be uncertain; reload the balance before another explicit set.',
    })
    @SerializeOptions({ type: CreditResponseDto })
    async setBalance(
        @Param() { organizationId }: CreditsAccountParamsDto,
        @Body() { amount }: SetBalanceDto,
    ): Promise<CreditResponseDto> {
        try {
            const balance = await this.creditsService.setBalance(organizationId, amount)
            return { balance }
        } catch (error) {
            if (error instanceof BalanceBelowReservedException) {
                throw new ConflictException('Requested balance is below reserved credits')
            }
            throw error
        }
    }
}
