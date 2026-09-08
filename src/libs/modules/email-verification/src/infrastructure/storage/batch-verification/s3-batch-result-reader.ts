import { Inject, Injectable } from '@nestjs/common'
import { ok } from 'node:assert'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { NoSuchKey } from '@aws-sdk/client-s3'
import { BatchResultReader, BatchResultUnavailableError } from '../../../application/delivery/batch/batch-result-reader'
import { parseS3ResultLocation } from './parse-s3-result-location'

@Injectable()
export class S3BatchResultReader implements BatchResultReader {
    constructor(@Inject(getS3ConnectionToken('default')) private readonly s3: S3) {}

    async read(resultFilePath: string): Promise<Readable> {
        const { bucket: Bucket, key: Key } = parseS3ResultLocation(resultFilePath)

        const { Body } = await this.s3.getObject({ Bucket, Key }).catch((error: unknown) => {
            if (error instanceof NoSuchKey) throw new BatchResultUnavailableError()
            throw error
        })

        ok(Body, `Failed to get object from bucket ${Bucket} with key ${Key}.`)

        return Readable.fromWeb(Body.transformToWebStream() as ReadableStream)
    }
}
