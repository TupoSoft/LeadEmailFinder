import {
    Controller,
    HttpCode,
    HttpStatus,
    Inject,
    ParseFilePipeBuilder,
    Post,
    SerializeOptions,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Express } from 'express'
import { BatchEmailVerificationFileValidator } from './batch-email-verification.file-validator'
import { BatchEmailVerificationService } from './batch-email-verification-service.interface'
import { UploadFileRequestDto, UploadFileResponseDto } from './batch-email-verification.dto'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'

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
                .addValidator(new BatchEmailVerificationFileValidator())
                .build({
                    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                }),
        )
        file: Express.Multer.File,
    ): Promise<UploadFileResponseDto> {
        return await this.batchEmailVerificationService.enqueueBatch(file)
    }
}
