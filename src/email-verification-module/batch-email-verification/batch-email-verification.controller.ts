import {
    Controller,
    HttpCode,
    HttpStatus,
    ParseFilePipeBuilder,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Express } from 'express'
import { BatchEmailVerificationFileValidator } from './batch-email-verification.file-validator'
import { randomUUID } from 'node:crypto'

@Controller('verifyBatch')
export class BatchEmailVerificationController {
    private static readonly MAX_FILE_SIZE = 1048576

    @Post('csv')
    @UseInterceptors(FileInterceptor('file'))
    @HttpCode(HttpStatus.ACCEPTED)
    uploadFile(
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
    ) {
        return { id: randomUUID() }
    }
}
