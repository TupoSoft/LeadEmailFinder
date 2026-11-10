import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { stringify } from 'csv-stringify'
import { Upload } from '@aws-sdk/lib-storage'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import { BatchResultWriter } from '../../../application/delivery/batch/batch-result-writer'
import { BatchRowEntity } from '../../persistence/typeorm/batch-row.entity'
import { BatchUniqueAddressEntity } from '../../persistence/typeorm/batch-unique-address.entity'
import { VerificationRequestEntity } from '../../persistence/typeorm/verification-request.entity'
import { EmailVerificationEntity } from '../../persistence/typeorm/email-verification.entity'
import { deriveResultsKey } from './derive-results-key'
import { spreadsheetSafeCell } from './spreadsheet-safe-cell'

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

interface RawResultRow {
    readonly sourceRow: number
    readonly originalEmail: string
    readonly normalizedAddress: string
    readonly firstSeenRow: number
    readonly resultId: string | null
    readonly billingState: string | null
    readonly chargedCount: number | null
    readonly finalReason: string | null
    readonly reason: string | null
    readonly sources: string[] | null
    readonly exists: boolean | null
    readonly catchAll: boolean | null
    readonly domain: string | null
    readonly localPart: string | null
    readonly format: string | null
    readonly targetExchange: string | null
    readonly mxDomain: string | null
    readonly resultCreatedAt: Date | null
    readonly verificationQuality: string | null
    readonly evidenceObservedAt: Date | null
    readonly evidencePolicyVersion: number | null
}

interface OutputRow {
    readonly id: string
    readonly email: string
    readonly normalizedEmail: string
    readonly sourceRow: number
    readonly duplicateOfRow: number | ''
    readonly domain: string
    readonly localPart: string
    readonly format: string
    readonly targetExchange: string
    readonly mxDomain: string
    readonly exists: boolean | ''
    readonly catchAll: boolean | ''
    readonly reason: string
    readonly sources: string
    readonly createdAt: string
    readonly verificationQuality: string
    readonly evidenceObservedAt: string
    readonly evidencePolicyVersion: number | ''
    readonly verificationStatus: 'completed' | 'processing' | 'failed'
    readonly creditsCharged: number
    readonly billingReason: string
}

const OUTPUT_COLUMNS: readonly { readonly key: keyof OutputRow; readonly header: string }[] = [
    { key: 'id', header: 'id' },
    { key: 'email', header: 'email' },
    { key: 'normalizedEmail', header: 'normalizedEmail' },
    { key: 'sourceRow', header: 'sourceRow' },
    { key: 'duplicateOfRow', header: 'duplicateOfRow' },
    { key: 'domain', header: 'domain' },
    { key: 'localPart', header: 'localPart' },
    { key: 'format', header: 'format' },
    { key: 'targetExchange', header: 'targetExchange' },
    { key: 'mxDomain', header: 'mxDomain' },
    { key: 'exists', header: 'exists' },
    { key: 'catchAll', header: 'catchAll' },
    { key: 'reason', header: 'reason' },
    { key: 'sources', header: 'sources' },
    { key: 'createdAt', header: 'createdAt' },
    { key: 'verificationQuality', header: 'verificationQuality' },
    { key: 'evidenceObservedAt', header: 'evidenceObservedAt' },
    { key: 'evidencePolicyVersion', header: 'evidencePolicyVersion' },
    { key: 'verificationStatus', header: 'verificationStatus' },
    { key: 'creditsCharged', header: 'creditsCharged' },
    { key: 'billingReason', header: 'billingReason' },
]

// Every other string field is customer-supplied or copied from customer input, so it must go through
// `spreadsheetSafeCell`. These are exclusively system-generated identities, enums, or safe derived values.
const TRUSTED_STRING_COLUMNS = new Set<keyof OutputRow>([
    'id',
    'format',
    'reason',
    'sources',
    'verificationQuality',
    'verificationStatus',
    'billingReason',
    'createdAt',
    'evidenceObservedAt',
])

function toOutputRow(raw: RawResultRow): OutputRow {
    const isDuplicate = raw.sourceRow !== raw.firstSeenRow
    const creditsCharged = isDuplicate ? 0 : (raw.chargedCount ?? 0)
    const billingReason = isDuplicate ? 'duplicate' : (raw.finalReason ?? 'pending')
    const verificationStatus: OutputRow['verificationStatus'] =
        raw.resultId !== null ? 'completed' : raw.billingState === 'settled' ? 'failed' : 'processing'

    return {
        id: raw.resultId ?? '',
        email: raw.originalEmail,
        normalizedEmail: raw.normalizedAddress,
        sourceRow: raw.sourceRow,
        duplicateOfRow: isDuplicate ? raw.firstSeenRow : '',
        domain: raw.domain ?? '',
        localPart: raw.localPart ?? '',
        format: raw.format ?? '',
        targetExchange: raw.targetExchange ?? '',
        mxDomain: raw.mxDomain ?? '',
        exists: raw.exists ?? '',
        catchAll: raw.catchAll ?? '',
        reason: raw.reason ?? '',
        sources: Array.isArray(raw.sources) ? raw.sources.join(';') : '',
        createdAt: raw.resultCreatedAt ? raw.resultCreatedAt.toISOString() : '',
        verificationQuality: raw.verificationQuality ?? '',
        evidenceObservedAt: raw.evidenceObservedAt ? raw.evidenceObservedAt.toISOString() : '',
        evidencePolicyVersion: raw.evidencePolicyVersion ?? '',
        verificationStatus,
        creditsCharged,
        billingReason,
    }
}

@Injectable()
export class S3BatchResultWriter implements BatchResultWriter {
    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        @Inject(CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN)
        private readonly customerObjectWriteSecurity: CustomerObjectWriteSecurity,
        private readonly dataSource: DataSource,
    ) {}

    async write(
        bucket: string,
        key: string,
        organizationId: string,
        batchId: string,
    ): Promise<{ resultFilePath: string }> {
        const cursor = await this.dataSource
            .createQueryBuilder()
            .select('row.sourceRow', 'sourceRow')
            .addSelect('row.originalEmail', 'originalEmail')
            .addSelect('row.normalizedAddress', 'normalizedAddress')
            .addSelect('address.firstSeenRow', 'firstSeenRow')
            .addSelect('COALESCE(address.resultId, request.resultId)', 'resultId')
            .addSelect('request.billingState', 'billingState')
            .addSelect('request.chargedCount', 'chargedCount')
            .addSelect('request.finalReason', 'finalReason')
            .addSelect('result.reason', 'reason')
            .addSelect('result.sources', 'sources')
            .addSelect('result.exists', 'exists')
            .addSelect('result.catchAll', 'catchAll')
            .addSelect('result.domain', 'domain')
            .addSelect('result.localPart', 'localPart')
            .addSelect('result.format', 'format')
            .addSelect('result.targetExchange', 'targetExchange')
            .addSelect('result.mxDomain', 'mxDomain')
            .addSelect('result.createdAt', 'resultCreatedAt')
            .addSelect('result.verificationQuality', 'verificationQuality')
            .addSelect('result.evidenceObservedAt', 'evidenceObservedAt')
            .addSelect('result.evidencePolicyVersion', 'evidencePolicyVersion')
            .from(BatchRowEntity, 'row')
            .innerJoin(
                BatchUniqueAddressEntity,
                'address',
                'address.batchId = row.batchId AND address.normalizedAddress = row.normalizedAddress',
            )
            .leftJoin(VerificationRequestEntity, 'request', 'request.requestId = address.payerRequestId')
            .leftJoin(EmailVerificationEntity, 'result', 'result.id = COALESCE(address.resultId, request.resultId)')
            .where('row.batchId = :batchId', { batchId })
            .andWhere('row.organizationId = :organizationId', { organizationId })
            .orderBy('row.sourceRow', 'ASC')
            .stream()

        const rowTransform = new Transform({
            objectMode: true,
            transform: (raw: RawResultRow, _encoding, callback) => {
                try {
                    callback(null, toOutputRow(raw))
                } catch (error) {
                    callback(error as Error)
                }
            },
        })

        const stringifier = stringify({
            columns: OUTPUT_COLUMNS,
            header: true,
            cast: {
                string: (value, context) =>
                    context.header || TRUSTED_STRING_COLUMNS.has(context.column as keyof OutputRow)
                        ? value
                        : spreadsheetSafeCell(value),
            },
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

        // `.pipe()` does not forward `error` events between streams. If `cursor`, `rowTransform`, or `stringifier`
        // errors, a bare `.pipe()` chain would leave `Body` open forever and `upload.done()` would never settle
        // (the AWS SDK's `Upload` consumes `Body` via `for await`). `pipeline()` forwards the error and
        // destroys every stream in the chain, so a failure here correctly rejects instead of hanging.
        await Promise.all([pipeline(cursor, rowTransform, stringifier, Body), upload.done()])

        return { resultFilePath: `s3://${bucket}/${Key}` }
    }
}
