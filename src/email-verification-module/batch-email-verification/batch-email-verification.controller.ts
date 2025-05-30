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
                    maxSize: 1048576,
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
