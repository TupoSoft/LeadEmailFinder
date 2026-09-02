import { Inject, Injectable, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import { Environment } from '@tuposoft/lead-email-finder/config'
import { CustomerObjectWriteSecurityModule } from './customer-object-write-security.module'
import { LeadEmailFinderApiModule } from './lead-email-finder-api.module'

jest.mock('@tuposoft/lead-email-finder/config', () => {
    const actualConfig = jest.requireActual<typeof import('@tuposoft/lead-email-finder/config')>(
        '@tuposoft/lead-email-finder/config',
    )

    return {
        ...actualConfig,
        validate: jest.fn((_dto: unknown, config: Record<string, unknown>) => config),
    }
})

@Injectable()
class ObjectWriterFixture {
    constructor(
        @Inject(CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN)
        readonly security: CustomerObjectWriteSecurity,
    ) {}
}

@Module({ providers: [ObjectWriterFixture] })
class ObjectWriterFixtureModule {}

describe('CustomerObjectWriteSecurityModule', () => {
    it('is registered exactly once by the API composition root', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, LeadEmailFinderApiModule) as unknown[]

        expect(imports.filter(moduleImport => moduleImport === CustomerObjectWriteSecurityModule)).toHaveLength(1)
    })

    it('exports one frozen production value globally to an infrastructure consumer', async () => {
        const configuration: Record<string, unknown> = {
            NODE_ENV: Environment.Production,
            S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
            S3_KMS_KEY_ID: 'configured-kms-key',
        }
        const moduleRef = await Test.createTestingModule({
            imports: [CustomerObjectWriteSecurityModule, ObjectWriterFixtureModule],
        })
            .overrideProvider(ConfigService)
            .useValue({ get: jest.fn((key: string) => configuration[key]) })
            .compile()

        const suppliedValue = moduleRef.get<CustomerObjectWriteSecurity>(CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN)
        const consumer = moduleRef.get(ObjectWriterFixture)

        expect(consumer.security).toBe(suppliedValue)
        expect(suppliedValue).toEqual({
            mode: 'production-kms',
            requireAuthenticatedHttps: true,
            serverSideEncryption: 'aws:kms',
            kmsKeyId: 'configured-kms-key',
            cacheControl: 'no-store',
        })
        expect(Object.isFrozen(suppliedValue)).toBe(true)

        await moduleRef.close()
    })
})
