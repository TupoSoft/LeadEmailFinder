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
    ApiBearerAuth,
    ApiBody,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiExcludeController,
    ApiForbiddenResponse,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Request } from 'express'
import { CreditsService } from '../application/credits.service'
import { AddCreditsDto, CreditResponseDto, CreditsAccountParamsDto, SetBalanceDto } from './credits.dto'
import { PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditIdempotencyConflict } from '../domain/credits.error'
import { parseCreditIdempotencyKey } from './credit-idempotency-key'

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
    @ApiOperation({
        summary: 'Add platform credits idempotently',
        description:
            'Reuse one key for the same organization and amount to return the current balance without another grant. ' +
            'Reusing that key with a different amount returns 409 without changing the balance. ' +
            'Both the first successful request and an equivalent replay return 201.',
    })
    @ApiBearerAuth('oidc')
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
    @SerializeOptions({ type: CreditResponseDto })
    async setBalance(
        @Param() { organizationId }: CreditsAccountParamsDto,
        @Body() { amount }: SetBalanceDto,
    ): Promise<CreditResponseDto> {
        const balance = await this.creditsService.setBalance(organizationId, amount)
        return { balance }
    }
}
