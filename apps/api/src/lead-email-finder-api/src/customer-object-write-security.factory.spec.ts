import { Environment } from '@tuposoft/lead-email-finder/config'
import { createCustomerObjectWriteSecurity } from './customer-object-write-security.factory'

describe('createCustomerObjectWriteSecurity', () => {
    it('creates one immutable development value without KMS fields', () => {
        const security = createCustomerObjectWriteSecurity({ NODE_ENV: Environment.Development })

        expect(security).toEqual({
            mode: 'development-local',
            cacheControl: 'no-store',
        })
        expect(Object.isFrozen(security)).toBe(true)
    })

    it('creates the exact immutable production KMS contract', () => {
        const security = createCustomerObjectWriteSecurity({
            NODE_ENV: Environment.Production,
            S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
            S3_KMS_KEY_ID: 'configured-kms-key',
        })

        expect(security).toEqual({
            mode: 'production-kms',
            requireAuthenticatedHttps: true,
            serverSideEncryption: 'aws:kms',
            kmsKeyId: 'configured-kms-key',
            cacheControl: 'no-store',
        })
        expect(Object.isFrozen(security)).toBe(true)
    })

    it.each([undefined, '', 'AES256'])(
        'rejects a production encryption mode other than aws:kms without exposing it: %s',
        S3_SERVER_SIDE_ENCRYPTION => {
            const createSecurity = (): void => {
                createCustomerObjectWriteSecurity({
                    NODE_ENV: Environment.Production,
                    S3_SERVER_SIDE_ENCRYPTION,
                    S3_KMS_KEY_ID: 'configured-kms-key',
                })
            }

            expect(createSecurity).toThrow('S3_SERVER_SIDE_ENCRYPTION: aws-kms-required')

            try {
                createSecurity()
            } catch (error) {
                expect(String(error)).not.toContain('AES256')
                expect(String(error)).not.toContain('configured-kms-key')
            }
        },
    )

    it.each([undefined, '', '   '])('rejects a missing production KMS key without exposing it: %s', S3_KMS_KEY_ID => {
        expect(() =>
            createCustomerObjectWriteSecurity({
                NODE_ENV: Environment.Production,
                S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
                S3_KMS_KEY_ID,
            }),
        ).toThrow('S3_KMS_KEY_ID: required')
    })
})
