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
import { BatchEmailVerificationService } from './batch-email-verification-service.interface'
import {
    GetBatchStatusRequestParamsDto,
    GetBatchStatusResponseDto,
    UploadFileRequestDto,
    UploadFileResponseDto,
} from './batch-email-verification.dto'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
import { JobNotFoundException } from './job-not-found.exception'
import { CurrentPrincipal, PermissionsGuard, RequirePermissions } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

@UseGuards(PermissionsGuard)
@Controller('verifyBatch')
export class BatchEmailVerificationController {
    private static readonly MAX_FILE_SIZE = 104857600

    constructor(
        @Inject('BatchEmailVerificationServiceToken')
        private readonly batchEmailVerificationService: BatchEmailVerificationService,
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
            file,
            principal,
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
            return await this.batchEmailVerificationService.getBatchStatus(id, principal)
        } catch (error) {
            if (error instanceof JobNotFoundException) {
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
            const readable = await this.batchEmailVerificationService.getBatchResults(id, principal)
            return new StreamableFile(readable, { type: 'text/csv' })
        } catch (error) {
            if (error instanceof JobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
