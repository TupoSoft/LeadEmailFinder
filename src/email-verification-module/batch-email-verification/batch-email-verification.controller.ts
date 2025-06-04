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
    SerializeOptions,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Express } from 'express'
import { BatchEmailVerificationService } from './batch-email-verification-service.interface'
import {
    GetBatchStatusRequestParamsDto,
    GetBatchStatusResponseDto,
    UploadFileRequestDto,
    UploadFileResponseDto,
} from './batch-email-verification.dto'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
import { JobNotFoundException } from './job-not-found.exception'

@Controller('verifyBatch')
export class BatchEmailVerificationController {
    private static readonly MAX_FILE_SIZE = 104857600

    constructor(
        @Inject('BatchEmailVerificationServiceToken')
        private readonly batchEmailVerificationService: BatchEmailVerificationService,
    ) {}

    @Post('csv')
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
    ): Promise<UploadFileResponseDto> {
        return await this.batchEmailVerificationService.uploadFile(file)
    }

    @Get(':id')
    @SerializeOptions({ type: GetBatchStatusResponseDto })
    async getBatchStatus(@Param() { id }: GetBatchStatusRequestParamsDto): Promise<GetBatchStatusResponseDto> {
        try {
            return await this.batchEmailVerificationService.getBatchStatus(id)
        } catch (error) {
            if (error instanceof JobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }

    @Get(':id/results')
    async getBatchResults(@Param() { id }: GetBatchStatusRequestParamsDto): Promise<StreamableFile> {
        try {
            const readable = await this.batchEmailVerificationService.getBatchResults(id)
            return new StreamableFile(readable)
        } catch (error) {
            if (error instanceof JobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
