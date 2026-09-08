import { Inject, Injectable } from '@nestjs/common'
import { ok } from 'node:assert'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { parse, Parser } from 'csv-parse'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { BatchInput, BatchInputRow } from '../../../application/delivery/batch/batch-input'
import { BatchEmailVerificationCsvRow } from './batch-email-verification-csv-row'

@Injectable()
export class S3BatchInput implements BatchInput {
    constructor(@Inject(getS3ConnectionToken('default')) private readonly s3: S3) {}

    async *rows(bucket: string, key: string): AsyncIterable<BatchInputRow> {
        const parser = await this.getParser(bucket, key)

        for await (const row of parser) {
            const csvRecord = plainToInstance(BatchEmailVerificationCsvRow, row)
            const errors = await validate(csvRecord)

            if (errors.length > 0) {
                throw new Error('batch_email_verification_row_invalid')
            }

            yield { email: csvRecord.email }
        }
    }

    private async getParser(bucket: string, key: string): Promise<Parser> {
        const { Body } = await this.s3.getObject({ Bucket: bucket, Key: key })

        ok(Body, `Failed to get object from bucket ${bucket} with key ${key}.`)

        return Readable.fromWeb(Body.transformToWebStream() as ReadableStream).pipe(
            parse({
                skip_empty_lines: true,
                columns: true,
                trim: true,
            }),
        )
    }
}
