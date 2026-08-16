import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { EnvironmentVariablesDto } from './environment-variables.dto'

describe('EnvironmentVariablesDto', (): void => {
    it.each([
        ['true', true],
        [true, true],
        ['false', false],
        [false, false],
    ])('parses boolean values when implicit conversion is enabled', (value, expected): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            {
                S3_FORCE_PATH_STYLE: value,
                TYPEORM_SYNCHRONIZE: value,
            },
            { enableImplicitConversion: true },
        )

        expect(environment.S3_FORCE_PATH_STYLE).toBe(expected)
        expect(environment.TYPEORM_SYNCHRONIZE).toBe(expected)
    })

    it('transforms proxy capacity values from environment variables', (): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            {
                PROXY_MX_REQUESTS_PER_MINUTE: '10',
                PROXY_LEASE_TTL_MS: '60000',
            },
            { enableImplicitConversion: true },
        )

        expect(environment.PROXY_MX_REQUESTS_PER_MINUTE).toBe(10)
        expect(environment.PROXY_LEASE_TTL_MS).toBe(60000)
    })

    it('transforms a configured SMTP port from an environment variable', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { SMTP_PORT: '2525' }, { enableImplicitConversion: true })

        expect(environment.SMTP_PORT).toBe(2525)
    })

    it.each([0, 65536, 25.5, 'not-a-number'])('rejects an invalid SMTP port: %s', (SMTP_PORT): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { SMTP_PORT }, { enableImplicitConversion: true })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('accepts a local Keycloak issuer and API audience', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
            OIDC_AUDIENCE: 'lead-email-finder-api',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects a malformed OIDC issuer URL', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { OIDC_ISSUER_URL: 'keycloak' })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('rejects a configuration missing the OIDC issuer or audience', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {})

        const errors = validateSync(environment).map(error => error.property)

        expect(errors).toEqual(expect.arrayContaining(['OIDC_ISSUER_URL', 'OIDC_AUDIENCE']))
    })
})
