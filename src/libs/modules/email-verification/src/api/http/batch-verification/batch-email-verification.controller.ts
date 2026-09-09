import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    NotFoundException,
    Param,
    ParseFilePipeBuilder,
    Post,
    Req,
    SerializeOptions,
    StreamableFile,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Express, Request } from 'express'
import {
    ApiAcceptedResponse,
    ApiBadRequestResponse,
    ApiBody,
    ApiConsumes,
    ApiForbiddenResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
    ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
    BatchEmailVerificationService,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { BatchEmailVerificationJobNotFoundException } from '../../../application/delivery/batch/job-not-found.exception'
import {
    GetBatchStatusRequestParamsDto,
    GetBatchStatusResponseDto,
    UploadFileRequestDto,
    UploadFileResponseDto,
} from './batch-email-verification.dto'

@ApiTags('Verification')
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@ApiForbiddenResponse({
    description: 'The required verification permission or browser mutation protection is missing.',
})
@UseGuards(PermissionsGuard)
@Controller('verifyBatch')
export class BatchEmailVerificationController {
    private static readonly MAX_FILE_SIZE = 104857600

    constructor(
        @Inject(BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN)
        private readonly batchEmailVerificationService: Pick<
            BatchEmailVerificationService,
            'uploadFile' | 'getBatchStatus' | 'getBatchResults'
        >,
    ) {}

    @Post('csv')
    @RequirePermissions('verification:run')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        type: UploadFileRequestDto,
        required: true,
        description:
            'One file part containing text/csv with an email header. Maximum size: 104857600 bytes (100 megabytes). Row validation and credit debit happen after acceptance.',
    })
    @ApiOperation({
        summary: 'Upload a CSV batch for asynchronous verification',
        security: [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }],
    })
    @ApiAcceptedResponse({
        type: UploadFileResponseDto,
        description: 'The batch was queued; validation and charging are not yet confirmed.',
    })
    @ApiUnprocessableEntityResponse({
        description: 'A CSV file is required, with media type text/csv and a maximum size of 104857600 bytes.',
    })
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: UploadFileResponseDto })
    async uploadFile(
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addFileTypeValidator({
                    fileType: 'text/csv',
                    skipMagicNumbersValidation: true,
                })
                .addMaxSizeValidator({
                    // Nest's maximum is exclusive; the public 100-megabyte limit is inclusive.
                    maxSize: BatchEmailVerificationController.MAX_FILE_SIZE + 1,
                    message: 'The CSV file must be at most 104857600 bytes (100 megabytes).',
                })
                .build({
                    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                }),
        )
        file: Express.MulterS3.File,
        @CurrentPrincipal() principal: AuthPrincipal,
        @Req() request: Request,
    ): Promise<UploadFileResponseDto> {
        return await this.batchEmailVerificationService.uploadFile(
            {
                bucket: file.bucket,
                key: file.key,
                organizationId: principal.organizationId,
                credentialId: principal.credentialId,
            },
            typeof request.id === 'string' ? request.id : undefined,
        )
    }

    @Get(':id')
    @ApiOperation({ summary: 'Read an organization-owned batch status', security: [{ lef_session: [] }, { oidc: [] }] })
    @ApiOkResponse({ type: GetBatchStatusResponseDto })
    @ApiBadRequestResponse({ description: 'The batch ID must be a UUID.' })
    @ApiNotFoundResponse({ description: 'The batch is not available to this organization.' })
    @RequirePermissions('verification:read')
    @SerializeOptions({ type: GetBatchStatusResponseDto })
    async getBatchStatus(
        @Param() { id }: GetBatchStatusRequestParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<GetBatchStatusResponseDto> {
        try {
            return await this.batchEmailVerificationService.getBatchStatus(id, principal.organizationId)
        } catch (error) {
            if (error instanceof BatchEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }

    @Get(':id/results')
    @ApiOperation({
        summary: 'Download an organization-owned completed batch CSV',
        security: [{ lef_session: [] }, { oidc: [] }],
    })
    @ApiOkResponse({
        description: 'The retained CSV result. Downloading does not enqueue verification or debit credits.',
        content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
        headers: {
            'Content-Disposition': {
                schema: { type: 'string' },
                description: 'attachment; filename="batch-verification-<uuid>.csv"',
            },
        },
    })
    @ApiBadRequestResponse({ description: 'The batch ID must be a UUID.' })
    @ApiNotFoundResponse({ description: 'The batch result is not available to this organization.' })
    @RequirePermissions('verification:read')
    async getBatchResults(
        @Param() { id }: GetBatchStatusRequestParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<StreamableFile> {
        try {
            const readable = await this.batchEmailVerificationService.getBatchResults(id, principal.organizationId)
            return new StreamableFile(readable, {
                type: 'text/csv',
                disposition: `attachment; filename="batch-verification-${id}.csv"`,
            })
        } catch (error) {
            if (error instanceof BatchEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
