import { Upload } from '@aws-sdk/lib-storage'
import { Inject, Injectable } from '@nestjs/common'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { Readable } from 'node:stream'
import { BatchResultUpload, BatchResultUploader } from './batch-result-uploader'

@Injectable()
export class S3BatchResultUploader implements BatchResultUploader {
    constructor(@Inject(getS3ConnectionToken('default')) private readonly s3: S3) {}

    startCsvUpload({ bucket, key, body }: { bucket: string; key: string; body: Readable }): BatchResultUpload {
        return new Upload({
            client: this.s3,
            params: {
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: 'text/csv',
            },
        })
    }
}
