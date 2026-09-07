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
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
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
                    maxSize: BatchEmailVerificationController.MAX_FILE_SIZE,
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
    @RequirePermissions('verification:read')
    async getBatchResults(
        @Param() { id }: GetBatchStatusRequestParamsDto,
        @CurrentPrincipal() principal: AuthPrincipal,
    ): Promise<StreamableFile> {
        try {
            const readable = await this.batchEmailVerificationService.getBatchResults(id, principal.organizationId)
            return new StreamableFile(readable, { type: 'text/csv' })
        } catch (error) {
            if (error instanceof BatchEmailVerificationJobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
