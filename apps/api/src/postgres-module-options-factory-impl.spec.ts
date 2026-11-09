import { ConfigService } from '@nestjs/config'
import { Environment } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto } from './environment-variables.dto'
import { PostgresModuleOptionsFactoryImpl } from './postgres-module-options-factory-impl'

describe('PostgresModuleOptionsFactoryImpl', (): void => {
    const createFactory = (configuration: Partial<EnvironmentVariablesDto>): PostgresModuleOptionsFactoryImpl => {
        const configService = {
            get: jest.fn((key: keyof EnvironmentVariablesDto) => configuration[key]),
        } as unknown as ConfigService<EnvironmentVariablesDto, true>

        return new PostgresModuleOptionsFactoryImpl(configService)
    }

    it('preserves plaintext PostgreSQL options for local development', (): void => {
        const url = 'postgresql://postgres:postgres@postgres:5432/lef'
        const factory = createFactory({
            NODE_ENV: Environment.Development,
            POSTGRES_URL: url,
            TYPEORM_SYNCHRONIZE: true,
        })

        expect(factory.createTypeOrmOptions()).toEqual({
            type: 'postgres',
            url,
            autoLoadEntities: true,
            synchronize: true,
        })
    })

    it('configures peer-verified TLS with custom CA contents in production', (): void => {
        const url = 'postgresql://service:password@postgres.example/lef?application_name=lef-api'
        const ca = '-----BEGIN CERTIFICATE-----\ntrusted-ca\n-----END CERTIFICATE-----'
        const factory = createFactory({
            NODE_ENV: Environment.Production,
            POSTGRES_URL: url,
            POSTGRES_TLS_CA: ca,
            TYPEORM_SYNCHRONIZE: false,
        })

        expect(factory.createTypeOrmOptions()).toEqual({
            type: 'postgres',
            url,
            autoLoadEntities: true,
            synchronize: false,
            ssl: {
                rejectUnauthorized: true,
                ca,
            },
        })
    })

    it('uses the Node.js configured default trust roots when a production CA is not configured', (): void => {
        const factory = createFactory({
            NODE_ENV: Environment.Production,
            POSTGRES_URL: 'postgresql://service:password@postgres.example/lef',
            TYPEORM_SYNCHRONIZE: false,
        })

        expect(factory.createTypeOrmOptions()).toMatchObject({
            ssl: { rejectUnauthorized: true },
        })
        expect(factory.createTypeOrmOptions()).not.toMatchObject({
            ssl: { ca: expect.anything() },
        })
    })

    it.each([
        ['ssl', '0'],
        ['sslcert', '/run/secrets/client-certificate'],
        ['sslkey', '/run/secrets/client-key'],
        ['sslmode', 'no-verify'],
        ['sslrootcert', '/run/secrets/untrusted-ca'],
    ])('rejects the production connection-string TLS override %s', (parameter, value): void => {
        const url = `postgresql://service:database-secret@postgres.example/lef?${parameter}=${encodeURIComponent(value)}`
        const factory = createFactory({
            NODE_ENV: Environment.Production,
            POSTGRES_URL: url,
            TYPEORM_SYNCHRONIZE: false,
        })

        expect(() => factory.createTypeOrmOptions()).toThrow(new Error('POSTGRES_URL: tls-override-not-allowed'))
    })

    it('redacts malformed production connection strings', (): void => {
        const secret = 'database-password-that-must-not-leak'
        const factory = createFactory({
            NODE_ENV: Environment.Production,
            POSTGRES_URL: `not a URL containing ${secret}`,
            TYPEORM_SYNCHRONIZE: false,
        })

        let thrown: unknown
        try {
            factory.createTypeOrmOptions()
        } catch (error: unknown) {
            thrown = error
        }

        expect(thrown).toEqual(new Error('POSTGRES_URL: invalid-url'))
        expect(String(thrown)).not.toContain(secret)
    })
})
