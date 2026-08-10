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
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/modules/api-key'

@UseGuards(ApiKeyGuard)
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
        @Req() req: Request,
    ): Promise<UploadFileResponseDto> {
        const authHeader = req.headers['authorization']
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
        const xApiKey = req.headers['x-api-key'] as string | undefined
        const apiKey = (bearerToken ?? xApiKey) as string

        return await this.batchEmailVerificationService.uploadFile(file, apiKey)
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
            return new StreamableFile(readable, { type: 'text/csv' })
        } catch (error) {
            if (error instanceof JobNotFoundException) {
                throw new NotFoundException(error.message)
            }

            throw error
        }
    }
}
