import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { stringify } from 'csv-stringify'
import { Upload } from '@aws-sdk/lib-storage'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import { BatchResultWriter } from '../../../application/delivery/batch/batch-result-writer'
import { EmailVerificationEntity } from '../../persistence/typeorm/email-verification.entity'
import { deriveResultsKey } from './derive-results-key'

type S3UploadSecurityParameters =
    | {
          CacheControl: 'no-store'
          ServerSideEncryption: 'aws:kms'
          SSEKMSKeyId: string
      }
    | {
          CacheControl: 'no-store'
      }

function mapCustomerObjectWriteSecurity(security: CustomerObjectWriteSecurity): S3UploadSecurityParameters {
    if (security.mode === 'production-kms') {
        return {
            CacheControl: security.cacheControl,
            ServerSideEncryption: security.serverSideEncryption,
            SSEKMSKeyId: security.kmsKeyId,
        }
    }

    return { CacheControl: security.cacheControl }
}

@Injectable()
export class S3BatchResultWriter implements BatchResultWriter {
    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        @Inject(CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN)
        private readonly customerObjectWriteSecurity: CustomerObjectWriteSecurity,
        @InjectRepository(EmailVerificationEntity)
        private readonly emailVerificationRepo: Repository<EmailVerificationEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async write(bucket: string, key: string, organizationId: string, batchId: string): Promise<{ resultFilePath: string }> {
        // `.stream()` returns raw driver rows keyed by TypeORM's generated hydration aliases (e.g. `ev_email`
        // for the `email` column of the `ev`-aliased query below), not bare entity property names. `key` tells
        // the stringifier which raw column to read; `header` keeps the CSV's own column names unprefixed.
        const queryAlias = 'ev'
        const columns = this.dataSource
            .getMetadata(EmailVerificationEntity)
            .columns.filter(({ propertyName }) => propertyName !== 'organizationId')
            .map(({ propertyName }) => ({ key: `${queryAlias}_${propertyName}`, header: propertyName }))
        const cursor = await this.emailVerificationRepo
            .createQueryBuilder(queryAlias)
            .where(`${queryAlias}.organizationId = :organizationId`, { organizationId })
            .andWhere(`${queryAlias}.batchId = :batchId`, { batchId })
            .stream()
        const stringifier = stringify({
            columns,
            header: true,
        })

        const Body = new PassThrough()
        const Key = deriveResultsKey(key)

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: bucket,
                Key,
                Body,
                ContentType: 'text/csv',
                ...mapCustomerObjectWriteSecurity(this.customerObjectWriteSecurity),
            },
        })

        // `.pipe()` does not forward `error` events between streams. If `cursor` or `stringifier` errors,
        // a bare `.pipe()` chain would leave `Body` open forever and `upload.done()` would never settle
        // (the AWS SDK's `Upload` consumes `Body` via `for await`). `pipeline()` forwards the error and
        // destroys every stream in the chain, so a failure here correctly rejects instead of hanging.
        await Promise.all([pipeline(cursor, stringifier, Body), upload.done()])

        return { resultFilePath: `s3://${bucket}/${Key}` }
    }
}
