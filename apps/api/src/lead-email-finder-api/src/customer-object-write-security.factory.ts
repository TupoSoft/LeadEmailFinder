import { CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import { Environment } from '@tuposoft/lead-email-finder/config'

export interface CustomerObjectWriteSecurityConfiguration {
    NODE_ENV: Environment
    S3_SERVER_SIDE_ENCRYPTION?: string
    S3_KMS_KEY_ID?: string
}

export function createCustomerObjectWriteSecurity(
    configuration: CustomerObjectWriteSecurityConfiguration,
): CustomerObjectWriteSecurity {
    if (configuration.NODE_ENV !== Environment.Production) {
        return Object.freeze({
            mode: 'development-local',
            cacheControl: 'no-store',
        })
    }

    if (configuration.S3_SERVER_SIDE_ENCRYPTION !== 'aws:kms') {
        throw new Error('S3_SERVER_SIDE_ENCRYPTION: aws-kms-required')
    }

    if (configuration.S3_KMS_KEY_ID === undefined || configuration.S3_KMS_KEY_ID.trim() === '') {
        throw new Error('S3_KMS_KEY_ID: required')
    }

    return Object.freeze({
        mode: 'production-kms',
        requireAuthenticatedHttps: true,
        serverSideEncryption: 'aws:kms',
        kmsKeyId: configuration.S3_KMS_KEY_ID,
        cacheControl: 'no-store',
    })
}
