import type { Request, Response } from 'express'
import {
    ApiAcceptedResponse,
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiGoneResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import {
    Body,
    Controller,
    HttpException,
    HttpStatus,
    Inject,
    Post,
    Req,
    Res,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
} from '../../../../application/delivery/synchronous/run-synchronous-verification'
import { EmailVerificationRequestDto } from './email-verification-request.dto'
import { EmailVerificationResponseDto } from '../../../email-verification-response.dto'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { parseVerificationIdempotencyKeyHeader } from '../../verification-idempotency-key-header'
import { VerificationRateLimitGuard } from '../../verification-rate-limit.guard'

@ApiTags('Verification')
@ApiUnauthorizedResponse({
    description: 'Authentication is required.',
    schema: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', enum: ['authentication_required'] } },
        example: { code: 'authentication_required' },
    },
})
@ApiForbiddenResponse({ description: 'The required verification permission is missing.' })
@UseGuards(PermissionsGuard)
@Controller('verify')
export class SyncEmailVerificationController {
    constructor(
        @Inject(RUN_SYNCHRONOUS_VERIFICATION)
        private readonly synchronousVerification: Pick<RunSynchronousVerification, 'execute'>,
    ) {}

    @Post()
    @ApiOperation({
        description:
            'Admits and drives one email inline through the durable admission stack, up to a bounded budget. A ' +
            'fresh, uncached submission reserves one credit; a cached or shared result costs nothing. When the ' +
            'budget is exhausted the execution keeps running in the background and this returns 202 with a ' +
            'Location header for polling, exactly like `POST /verifyAsync`. An optional canonical lowercase ' +
            'UUIDv7 Idempotency-Key header lets a caller safely retry an uncertain submission.',
    })
    @ApiCreatedResponse({ type: EmailVerificationResponseDto, description: 'The verification completed in time.' })
    @ApiAcceptedResponse({
        description: 'The verification is still running; poll GET /verifyAsync/:id using the returned ID.',
        schema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
        },
    })
    @ApiBadRequestResponse({
        description: 'The email is missing/invalid, or the Idempotency-Key header is malformed or repeated.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
                statusCode: { type: 'integer', enum: [400] },
                message: { type: 'string' },
                error: { type: 'string' },
            },
            example: { statusCode: 400, message: 'invalid_idempotency_key', error: 'Bad Request' },
        },
    })
    @ApiResponse({
        status: 402,
        description: 'The organization has insufficient credits; no execution was funded.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: { statusCode: { type: 'integer', enum: [402] }, message: { type: 'string', enum: ['insufficient_credits'] } },
            example: { statusCode: 402, message: 'insufficient_credits' },
        },
    })
    @ApiResponse({
        status: 409,
        description: 'The supplied Idempotency-Key was already used for a different address or delivery mode.',
        schema: {
            type: 'object',
            properties: { statusCode: { type: 'integer', enum: [409] }, message: { type: 'string' } },
            example: { statusCode: 409, message: 'idempotency_key_conflict' },
        },
    })
    @ApiGoneResponse({
        description: 'The supplied Idempotency-Key is more than 24 hours old.',
        schema: {
            type: 'object',
            properties: { statusCode: { type: 'integer', enum: [410] }, message: { type: 'string' } },
            example: { statusCode: 410, message: 'idempotency_key_expired' },
        },
    })
    @ApiTooManyRequestsResponse({
        description: 'The organization submission rate limit, or a per-address terminal-inconclusive cooldown, was exceeded.',
        schema: {
            type: 'object',
            properties: { statusCode: { type: 'integer', enum: [429] }, message: { type: 'string' } },
            example: { statusCode: 429, message: 'rate_limited' },
        },
    })
    @RequirePermissions('verification:run')
    @UseGuards(VerificationRateLimitGuard)
    @SerializeOptions({ type: EmailVerificationResponseDto })
    async verifyEmail(
        @Body() emailVerificationRequest: EmailVerificationRequestDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<EmailVerificationResponseDto | { readonly id: string }> {
        const header = parseVerificationIdempotencyKeyHeader(request.rawHeaders)
        if (header.kind === 'malformed' || header.kind === 'too-far-ahead') {
            throw new HttpException(
                header.kind === 'malformed' ? 'invalid_idempotency_key' : 'idempotency_key_too_far_ahead',
                HttpStatus.BAD_REQUEST,
            )
        }

        const outcome = await this.synchronousVerification.execute({
            organizationId: principal.organizationId,
            email: emailVerificationRequest.email,
            clientRequestKey: header.kind === 'valid' ? header.key : undefined,
        })

        switch (outcome.kind) {
            case 'completed':
                response.status(HttpStatus.CREATED)
                return { ...outcome.result, operation: outcome.operation }
            case 'failed':
                response.status(HttpStatus.ACCEPTED)
                response.setHeader('Location', `/verifyAsync/${outcome.operation.id}`)
                return { id: outcome.operation.id }
            case 'accepted':
                response.status(HttpStatus.ACCEPTED)
                response.setHeader('Location', `/verifyAsync/${outcome.id}`)
                return { id: outcome.id }
            case 'insufficient-funds':
                throw new HttpException('insufficient_credits', HttpStatus.PAYMENT_REQUIRED)
            case 'conflict':
                throw new HttpException(
                    outcome.reason === 'key-mismatch' ? 'idempotency_key_conflict' : 'idempotency_key_expired',
                    outcome.reason === 'key-mismatch' ? HttpStatus.CONFLICT : HttpStatus.GONE,
                )
            case 'address-cooldown':
                response.setHeader('Retry-After', String(Math.ceil(outcome.retryAfterMs / 1000)))
                throw new HttpException('verification_cooldown', HttpStatus.TOO_MANY_REQUESTS)
        }
    }
}
