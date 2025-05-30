import { FileValidator } from '@nestjs/common'
import { IFile } from '@nestjs/common/pipes/file/interfaces'
import { parse } from 'csv-parse'
import { Readable } from 'stream'
import { plainToInstance } from 'class-transformer'
import { BatchEmailVerificationCsvRowDto } from './batch-email-verification-csv-row.dto'
import { validate } from 'class-validator'

export class BatchEmailVerificationFileValidator extends FileValidator {
    private errorMessage = ''

    constructor() {
        super({})
    }

    buildErrorMessage(): string {
        return this.errorMessage
    }

    async isValid(file: IFile | IFile[] | { [p: string]: IFile[] } | undefined): Promise<boolean> {
        if (!file || Array.isArray(file) || (typeof file === 'object' && !Buffer.isBuffer(file.buffer))) {
            this.errorMessage = 'Invalid file format'
            return false
        }

        if (!file.buffer) {
            this.errorMessage = 'File buffer is empty'
            return false
        }

        const bufferStream = new Readable()
        bufferStream.push(file.buffer)
        bufferStream.push(null)

        const parser = bufferStream.pipe(
            parse({
                skip_empty_lines: true,
                trim: true,
                columns: true,
            }),
        )

        let lineCount = 0

        for await (const row of parser) {
            const csvRecord = plainToInstance(BatchEmailVerificationCsvRowDto, row)
            const errors = await validate(csvRecord)

            if (errors.length > 0) {
                const [firstError] = errors
                this.errorMessage = `Invalid ${firstError.property} in line ${lineCount}: ${firstError.value}`
                return false
            }

            ++lineCount
        }

        return lineCount !== 0
    }
}
