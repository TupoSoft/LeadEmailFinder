import { ConfigService } from '@nestjs/config'
import { Environment } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto } from './environment-variables.dto'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'

describe('S3ModuleOptionsFactoryImpl', (): void => {
    const developmentConfiguration: Partial<EnvironmentVariablesDto> = {
        NODE_ENV: Environment.Development,
        S3_ACCESS_KEY_ID: 'garage-access-key',
        S3_SECRET_KEY: 'garage-secret-key',
        S3_URL: 'http://garage:3900',
        S3_REGION: 'garage',
        S3_FORCE_PATH_STYLE: true,
    }

    const productionConfiguration: Partial<EnvironmentVariablesDto> = {
        ...developmentConfiguration,
        NODE_ENV: Environment.Production,
        S3_URL: 'https://objects.example',
        S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
        S3_KMS_KEY_ID: 'alias/customer-objects',
    }

    const createFactory = (overrides: Partial<EnvironmentVariablesDto> = {}): S3ModuleOptionsFactoryImpl => {
        const configuration = { ...developmentConfiguration, ...overrides }
        const configService = {
            get: jest.fn((key: keyof EnvironmentVariablesDto) => configuration[key]),
        } as unknown as ConfigService<EnvironmentVariablesDto, true>

        return new S3ModuleOptionsFactoryImpl(configService)
    }

    it('preserves the local HTTP Garage client configuration in development', (): void => {
        const factory = createFactory()

        expect(factory.createS3ModuleOptions()).toEqual({
            config: {
                credentials: {
                    accessKeyId: 'garage-access-key',
                    secretAccessKey: 'garage-secret-key',
                },
                endpoint: 'http://garage:3900',
                region: 'garage',
                forcePathStyle: true,
            },
        })
    })

    it('accepts an authenticated HTTPS endpoint and KMS configuration in production', (): void => {
        const factory = createFactory(productionConfiguration)

        expect(factory.createS3ModuleOptions()).toEqual({
            config: {
                credentials: {
                    accessKeyId: 'garage-access-key',
                    secretAccessKey: 'garage-secret-key',
                },
                endpoint: 'https://objects.example',
                region: 'garage',
                forcePathStyle: true,
                requestHandler: {
                    httpsAgent: {
                        rejectUnauthorized: true,
                    },
                },
            },
        })
    })

    it.each(['http://objects.example', 'ftp://objects.example', 'not-a-url'])(
        'rejects an unauthenticated production endpoint: %s',
        (endpoint): void => {
            const factory = createFactory({ ...productionConfiguration, S3_URL: endpoint })

            expect(() => factory.createS3ModuleOptions()).toThrow(new Error('S3_URL: authenticated-https-required'))
        },
    )

    it('pins peer verification when a process-wide setting would otherwise disable it', (): void => {
        const previousValue = process.env['NODE_TLS_REJECT_UNAUTHORIZED']
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

        try {
            const options = createFactory(productionConfiguration).createS3ModuleOptions()

            expect(options.config?.requestHandler).toEqual({
                httpsAgent: {
                    rejectUnauthorized: true,
                },
            })
        } finally {
            if (previousValue === undefined) {
                delete process.env['NODE_TLS_REJECT_UNAUTHORIZED']
            } else {
                process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = previousValue
            }
        }
    })

    it.each([undefined, '', 'AES256'])('rejects a non-KMS production encryption mode: %s', encryption => {
        const factory = createFactory({
            ...productionConfiguration,
            S3_SERVER_SIDE_ENCRYPTION: encryption,
        })

        expect(() => factory.createS3ModuleOptions()).toThrow(new Error('S3_SERVER_SIDE_ENCRYPTION: aws-kms-required'))
    })

    it.each([undefined, '', '   '])('rejects a missing production KMS key ID: %s', kmsKeyId => {
        const factory = createFactory({ ...productionConfiguration, S3_KMS_KEY_ID: kmsKeyId })

        expect(() => factory.createS3ModuleOptions()).toThrow(new Error('S3_KMS_KEY_ID: required'))
    })

    it('does not reveal endpoint credentials in a production transport error', (): void => {
        const secret = 's3-url-secret-that-must-not-leak'
        const factory = createFactory({
            ...productionConfiguration,
            S3_URL: `http://service:${secret}@objects.example`,
        })

        let thrown: unknown
        try {
            factory.createS3ModuleOptions()
        } catch (error: unknown) {
            thrown = error
        }

        expect(thrown).toEqual(new Error('S3_URL: authenticated-https-required'))
        expect(String(thrown)).not.toContain(secret)
    })
})
