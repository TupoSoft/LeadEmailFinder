import type { Request, Response } from 'express'
import {
    ApiAcceptedResponse,
    ApiBadRequestResponse,
    ApiExtraModels,
    ApiForbiddenResponse,
    ApiGoneResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
    getSchemaPath,
} from '@nestjs/swagger'
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
    Inject,
    NotFoundException,
    Param,
    Post,
    Req,
    Res,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import {
    AsyncVerificationCompletedResponseDto,
    AsyncVerificationFailedResponseDto,
    AsyncVerificationQueuedResponseDto,
    AsyncVerificationRunningResponseDto,
    AsyncVerificationUnavailableResponseDto,
    GetAsyncVerificationStatusRequestParamsDto,
    GetAsyncVerificationStatusResponseDto,
    VerifyAsyncRequestBodyDto,
    VerifyAsyncResponseDto,
} from './async-email-verification.dto'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
} from '../../../application/delivery/async/async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from '../../../application/delivery/async/job-not-found.exception'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { parseVerificationIdempotencyKeyHeader } from '../verification-idempotency-key-header'
import { VerificationRateLimitGuard } from '../verification-rate-limit.guard'

const statusModels = [
    AsyncVerificationQueuedResponseDto,
    AsyncVerificationRunningResponseDto,
    AsyncVerificationCompletedResponseDto,
    AsyncVerificationFailedResponseDto,
    AsyncVerificationUnavailableResponseDto,
]

@ApiTags('Verification')
@ApiExtraModels(...statusModels)
@ApiUnauthorizedResponse({
    description: 'Authentication is required.',
    schema: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', enum: ['authentication_required'] } },
        example: { code: 'authentication_required' },
    },
})
@ApiForbiddenResponse({
    description: 'The required verification permission or browser mutation protection is missing.',
    schema: {
        type: 'object',
        properties: {
            statusCode: { type: 'integer', example: 403 },
            message: { type: 'string' },
            error: { type: 'string' },
            code: { type: 'string' },
        },
        example: { statusCode: 403, message: 'Missing required permission', error: 'Forbidden' },
    },
})
@UseGuards(PermissionsGuard)
@Controller('/verifyAsync')
export class AsyncEmailVerificationController {
    constructor(
        @Inject(ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN)
        private readonly asyncEmailVerificationService: Pick<
            AsyncEmailVerificationService,
            'verifyAsync' | 'getAsyncVerificationState'
        >,
    ) {}

    @Post()
    @ApiOperation({
        description:
            'Admits one email for the authenticated organization through the durable admission stack. A fresh, uncached submission reserves one credit; a cached or shared result costs nothing. An optional canonical lowercase UUIDv7 Idempotency-Key header lets a caller safely retry an uncertain submission. Browser sessions require same-origin mutation protection.',
        security: [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }],
    })
    @ApiAcceptedResponse({
        type: VerifyAsyncResponseDto,
        description: 'The operation was admitted. Use its ID to read status.',
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
            properties: {
                statusCode: { type: 'integer', enum: [402] },
                message: { type: 'string', enum: ['insufficient_credits'] },
            },
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
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: VerifyAsyncResponseDto })
    async verifyAsync(
        @Body() body: VerifyAsyncRequestBodyDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<VerifyAsyncResponseDto> {
        const header = parseVerificationIdempotencyKeyHeader(request.rawHeaders)
        if (header.kind === 'malformed' || header.kind === 'too-far-ahead') {
            throw new HttpException(
                header.kind === 'malformed' ? 'invalid_idempotency_key' : 'idempotency_key_too_far_ahead',
                HttpStatus.BAD_REQUEST,
            )
        }

        const outcome = await this.asyncEmailVerificationService.verifyAsync({
            email: body.email,
            organizationId: principal.organizationId,
            clientRequestKey: header.kind === 'valid' ? header.key : undefined,
        })

        switch (outcome.kind) {
            case 'accepted':
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

    @Get(':id')
    @ApiOperation({
        description:
            'Reads an organization-owned operation without debit or submission. Missing, expired, and foreign operations are concealed with the same 404 response.',
        security: [{ lef_session: [] }, { oidc: [] }],
    })
    @ApiOkResponse({
        description: 'A sanitized operation status. Unavailable means a trustworthy outcome cannot be reported.',
        content: {
            'application/json': {
                schema: {
                    oneOf: statusModels.map(model => ({ $ref: getSchemaPath(model) })),
                    discriminator: {
                        propertyName: 'state',
                        mapping: {
                            queued: getSchemaPath(AsyncVerificationQueuedResponseDto),
                            running: getSchemaPath(AsyncVerificationRunningResponseDto),
                            completed: getSchemaPath(AsyncVerificationCompletedResponseDto),
                            failed: getSchemaPath(AsyncVerificationFailedResponseDto),
                            unavailable: getSchemaPath(AsyncVerificationUnavailableResponseDto),
                        },
                    },
                },
                examples: {
                    queued: { value: { state: 'queued' } },
                    running: { value: { state: 'running' } },
                    completed: {
                        value: {
                            state: 'completed',
                            result: {
                                id: '00000000-0000-4000-8000-000000000002',
                                email: 'person@lef.test',
                                localPart: 'person',
                                domain: 'lef.test',
                                exists: true,
                                catchAll: null,
                                reason: 'accepted_email',
                                sources: ['mx'],
                            },
                            operation: {
                                id: '00000000-0000-4000-8000-000000000003',
                                source: 'fresh',
                                observedAt: '2026-09-13T00:00:00.000Z',
                                cacheExpiresAt: '2026-09-14T00:00:00.000Z',
                                billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
                            },
                        },
                    },
                    failed: {
                        value: {
                            state: 'failed',
                            failureCode: 'verification_failed',
                            operation: {
                                id: '00000000-0000-4000-8000-000000000003',
                                source: 'fresh',
                                observedAt: null,
                                cacheExpiresAt: null,
                                billing: { state: 'settled', reserved: 1, charged: 0, reason: 'inconclusive' },
                            },
                        },
                    },
                    unavailable: { value: { state: 'unavailable' } },
                },
            },
        },
    })
    @ApiBadRequestResponse({
        description: 'The operation ID is not a UUID.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
                statusCode: { type: 'integer', enum: [400] },
                message: { type: 'array', items: { type: 'string' } },
                error: { type: 'string' },
            },
            example: { statusCode: 400, message: ['id must be a UUID'], error: 'Bad Request' },
        },
    })
    @ApiNotFoundResponse({
        description: 'No accessible operation matches the ID.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
                statusCode: { type: 'integer', enum: [404] },
                message: { type: 'string' },
                error: { type: 'string' },
            },
            example: {
                statusCode: 404,
                message: 'Job with id "00000000-0000-4000-8000-000000000001" not found.',
                error: 'Not Found',
            },
        },
    })
    @RequirePermissions('verification:read')
    @SerializeOptions({ type: GetAsyncVerificationStatusResponseDto })
    async getAsyncVerificationState(
        @Param() { id }: GetAsyncVerificationStatusRequestParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<GetAsyncVerificationStatusResponseDto> {
        try {
            return await this.asyncEmailVerificationService.getAsyncVerificationState(id, principal.organizationId)
        } catch (error) {
            if (error instanceof AsyncEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
