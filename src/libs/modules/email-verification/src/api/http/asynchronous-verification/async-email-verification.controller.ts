import type { Request } from 'express'
import {
    ApiAcceptedResponse,
    ApiBadRequestResponse,
    ApiExtraModels,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiUnauthorizedResponse,
    getSchemaPath,
} from '@nestjs/swagger'
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    NotFoundException,
    Param,
    Post,
    Req,
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
import { CreditGuard } from '@tuposoft/lead-email-finder/modules/credits'

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
            'Enqueues one email for the authenticated organization. A request may consume one credit, including validation or dispatch failures. Do not automatically retry an uncertain submission. Browser sessions require same-origin mutation protection.',
        security: [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }],
    })
    @ApiAcceptedResponse({
        type: VerifyAsyncResponseDto,
        description: 'The job was accepted. Use its ID to read status.',
    })
    @ApiBadRequestResponse({
        description: 'The email is missing or invalid. Validation runs after the credit guard.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
                statusCode: { type: 'integer', enum: [400] },
                message: { type: 'array', items: { type: 'string' } },
                error: { type: 'string' },
            },
            example: { statusCode: 400, message: ['email must be an email'], error: 'Bad Request' },
        },
    })
    @ApiResponse({
        status: 402,
        description: 'The organization has insufficient credits; no job was submitted.',
        schema: {
            type: 'object',
            required: ['statusCode', 'message'],
            properties: {
                statusCode: { type: 'integer', enum: [402] },
                message: { type: 'string', enum: ['Insufficient credits'] },
            },
            example: { statusCode: 402, message: 'Insufficient credits' },
        },
    })
    @RequirePermissions('verification:run')
    @UseGuards(CreditGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: VerifyAsyncResponseDto })
    async verifyAsync(
        @Body() body: VerifyAsyncRequestBodyDto,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request: Request,
    ): Promise<VerifyAsyncResponseDto> {
        return await this.asyncEmailVerificationService.verifyAsync({
            email: body.email,
            organizationId: principal.organizationId,
            credentialId: principal.credentialId,
            requestId: typeof request.id === 'string' ? request.id : undefined,
        })
    }

    @Get(':id')
    @ApiOperation({
        description:
            'Reads an organization-owned job without debit or submission. Missing, expired, and foreign jobs are concealed with the same 404 response.',
        security: [{ lef_session: [] }, { oidc: [] }],
    })
    @ApiOkResponse({
        description: 'A sanitized job outcome. Unavailable means a trustworthy outcome cannot be reported.',
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
                        },
                    },
                    failed: { value: { state: 'failed', failureCode: 'verification_failed' } },
                    unavailable: { value: { state: 'unavailable' } },
                },
            },
        },
    })
    @ApiBadRequestResponse({
        description: 'The job ID is not a UUID.',
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
        description: 'No accessible job matches the ID.',
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
