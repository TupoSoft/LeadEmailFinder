import { CustomerObjectWriteSecurity } from '../interfaces/customer-object-storage'

export type CustomerObjectWriteSecurityMapping =
    | {
          cacheControl: 'no-store'
          serverSideEncryption: 'aws:kms'
          kmsKeyId: string
      }
    | {
          cacheControl: 'no-store'
      }

interface CustomerObjectWriteSecurityContractOptions {
    writeWithSecurity(
        security: CustomerObjectWriteSecurity,
    ): CustomerObjectWriteSecurityMapping | Promise<CustomerObjectWriteSecurityMapping>
}

export function customerObjectWriteSecurityContract(
    adapterName: string,
    options: CustomerObjectWriteSecurityContractOptions,
): void {
    describe(`${adapterName} customer-object write security contract`, () => {
        it('maps the exact production SSE-KMS and no-store parameters', async () => {
            const security: CustomerObjectWriteSecurity = {
                mode: 'production-kms',
                requireAuthenticatedHttps: true,
                serverSideEncryption: 'aws:kms',
                kmsKeyId: 'contract-test-kms-key',
                cacheControl: 'no-store',
            }

            await expect(Promise.resolve(options.writeWithSecurity(security))).resolves.toStrictEqual({
                cacheControl: 'no-store',
                serverSideEncryption: 'aws:kms',
                kmsKeyId: 'contract-test-kms-key',
            })
        })

        it('maps no-store without KMS parameters for local development', async () => {
            const security: CustomerObjectWriteSecurity = {
                mode: 'development-local',
                cacheControl: 'no-store',
            }

            await expect(Promise.resolve(options.writeWithSecurity(security))).resolves.toStrictEqual({
                cacheControl: 'no-store',
            })
        })
    })
}
