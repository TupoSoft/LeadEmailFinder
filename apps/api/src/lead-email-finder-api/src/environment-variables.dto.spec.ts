import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { EnvironmentVariablesDto, normalizeEnvironmentConfiguration } from './environment-variables.dto'

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

    it.each([
        ['POSTGRES_TLS_CA', '-----BEGIN CERTIFICATE-----\npostgres-ca\n-----END CERTIFICATE-----'],
        ['REDIS_TLS_CA', '-----BEGIN CERTIFICATE-----\nredis-ca\n-----END CERTIFICATE-----'],
        ['S3_SERVER_SIDE_ENCRYPTION', 'aws:kms'],
        ['S3_KMS_KEY_ID', 'alias/customer-objects'],
    ] as const)('accepts the optional production security setting %s', (property, value): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { [property]: value })

        const errors = validateSync(environment, { skipMissingProperties: true })

        expect(errors.find(error => error.property === property)).toBeUndefined()
        expect(environment[property]).toBe(value)
    })

    it.each(['POSTGRES_TLS_CA', 'REDIS_TLS_CA', 'S3_SERVER_SIDE_ENCRYPTION', 'S3_KMS_KEY_ID'] as const)(
        'rejects a non-string %s setting',
        (property): void => {
            const environment = plainToInstance(EnvironmentVariablesDto, { [property]: { unexpected: true } })

            expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
                property,
            )
        },
    )

    it.each([
        'POSTGRES_TLS_CA',
        'REDIS_TLS_CA',
        'S3_KMS_KEY_ID',
        'BETTER_AUTH_SECRET',
        'AUTH_MAIL_SMTP_PASSWORD',
    ] as const)('accepts %s from a validated secret-file path', property => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            [`${property}_FILE`]: `/run/secrets/${property.toLowerCase()}`,
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it.each([
        'POSTGRES_TLS_CA',
        'REDIS_TLS_CA',
        'S3_KMS_KEY_ID',
        'BETTER_AUTH_SECRET',
        'AUTH_MAIL_SMTP_PASSWORD',
    ] as const)('rejects %s from outside the secret-file directory', property => {
        const fileProperty = `${property}_FILE`
        const environment = plainToInstance(EnvironmentVariablesDto, {
            [fileProperty]: `/tmp/${property.toLowerCase()}`,
        })

        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
            fileProperty,
        )
    })

    it.each([
        'POSTGRES_TLS_CA',
        'REDIS_TLS_CA',
        'S3_KMS_KEY_ID',
        'BETTER_AUTH_SECRET',
        'AUTH_MAIL_SMTP_PASSWORD',
    ] as const)('rejects duplicate inline and file sources for %s without exposing either value', property => {
        const secretValue = 'sensitive-inline-value'
        const secretFile = `/run/secrets/${property.toLowerCase()}`

        expect(() =>
            normalizeEnvironmentConfiguration({
                [property]: secretValue,
                [`${property}_FILE`]: secretFile,
            }),
        ).toThrow(`${property}: multiple-sources`)

        try {
            normalizeEnvironmentConfiguration({
                [property]: secretValue,
                [`${property}_FILE`]: secretFile,
            })
        } catch (error) {
            expect(String(error)).not.toContain(secretValue)
            expect(String(error)).not.toContain(secretFile)
        }
    })

    it('keeps production-only security settings optional for local development', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {})
        const productionSecurityProperties = [
            'POSTGRES_TLS_CA',
            'REDIS_TLS_CA',
            'S3_SERVER_SIDE_ENCRYPTION',
            'S3_KMS_KEY_ID',
        ]

        const errors = validateSync(environment).map(error => error.property)

        expect(errors).not.toEqual(expect.arrayContaining(productionSecurityProperties))
    })

    it('keeps native authentication settings optional until a process composes the runtime', (): void => {
        const errors = validateSync(plainToInstance(EnvironmentVariablesDto, {})).map(error => error.property)

        expect(errors).not.toEqual(
            expect.arrayContaining([
                'BETTER_AUTH_SECRET',
                'AUTH_MAIL_SMTP_HOST',
                'AUTH_MAIL_SMTP_PORT',
                'AUTH_MAIL_SMTP_SECURE',
                'AUTH_MAIL_SMTP_USER',
                'AUTH_MAIL_SMTP_PASSWORD',
                'AUTH_MAIL_FROM',
            ]),
        )
    })

    it('transforms native authentication mail settings from environment variables', (): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            { AUTH_MAIL_SMTP_PORT: '1025', AUTH_MAIL_SMTP_SECURE: 'true' },
            { enableImplicitConversion: true },
        )

        expect(environment.AUTH_MAIL_SMTP_PORT).toBe(1025)
        expect(environment.AUTH_MAIL_SMTP_SECURE).toBe(true)
        const invalid = plainToInstance(EnvironmentVariablesDto, { AUTH_MAIL_SMTP_PORT: '70000' })
        expect(validateSync(invalid, { skipMissingProperties: true }).map(error => error.property)).toContain(
            'AUTH_MAIL_SMTP_PORT',
        )
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

    it.each([
        ['no account-discovery configuration', {}],
        ['a proxy alone', { CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080' }],
        [
            'a complete Office Apps selection',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'a complete selection with the proxy in a secret file',
            {
                CATCH_ALL_HTTP_PROXY_URL_FILE: '/run/secrets/catch_all_http_proxy_url',
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'a complete Mimecast UK selection',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'mimecast',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'uk',
            },
        ],
    ])('accepts %s', (_name, configuration): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, configuration)

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects an account-discovery proxy file outside the secret directory', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            CATCH_ALL_HTTP_PROXY_URL_FILE: '/tmp/catch_all_http_proxy_url',
            CATCH_ALL_PROVIDER: 'office_apps',
            CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
            CATCH_ALL_PROVIDER_REGION: 'us',
        })

        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
            'CATCH_ALL_HTTP_PROXY_URL_FILE',
        )
    })

    it('rejects duplicate inline and file proxy sources without exposing either value', (): void => {
        const proxyUrl = 'http://proxy-user:proxy-password@proxy.example:8080'
        const proxyFile = '/run/secrets/catch_all_http_proxy_url'

        expect(() =>
            normalizeEnvironmentConfiguration({
                CATCH_ALL_HTTP_PROXY_URL: proxyUrl,
                CATCH_ALL_HTTP_PROXY_URL_FILE: proxyFile,
            }),
        ).toThrow('CATCH_ALL_HTTP_PROXY_URL: multiple-sources')

        try {
            normalizeEnvironmentConfiguration({
                CATCH_ALL_HTTP_PROXY_URL: proxyUrl,
                CATCH_ALL_HTTP_PROXY_URL_FILE: proxyFile,
            })
        } catch (error) {
            expect(String(error)).not.toContain(proxyUrl)
            expect(String(error)).not.toContain(proxyFile)
        }
    })

    it.each([
        [
            'a provider without a proxy',
            {
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'a provider without an approval ID',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'a provider without a region',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
            },
        ],
        [
            'an approval ID without a provider',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
            },
        ],
        [
            'a region without a provider',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'LinkedIn',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'linkedin',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'an unknown provider',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'unknown',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'Mimecast with an unsupported region',
            {
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'mimecast',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'eu',
            },
        ],
    ])('rejects %s', (_name, configuration): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, configuration)
        const accountDiscoveryProperties = [
            'CATCH_ALL_PROVIDER',
            'CATCH_ALL_PROVIDER_APPROVAL_ID',
            'CATCH_ALL_PROVIDER_REGION',
        ]

        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toEqual(
            expect.arrayContaining(accountDiscoveryProperties.filter(property => property in configuration)),
        )
    })

    it('transforms a configured SMTP port from an environment variable', (): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            { SMTP_PORT: '2525' },
            { enableImplicitConversion: true },
        )

        expect(environment.SMTP_PORT).toBe(2525)
    })

    it.each([0, 65536, 25.5, 'not-a-number'])('rejects an invalid SMTP port: %s', (SMTP_PORT): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { SMTP_PORT }, { enableImplicitConversion: true })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('accepts a nonempty SMTP-only CA file path', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { SMTP_TLS_CA_FILE: '/smtp-tls/ca.crt' })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects an empty SMTP-only CA file path', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { SMTP_TLS_CA_FILE: '' })

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

    it('accepts a configuration with no OIDC_JWKS_URI set (optional)', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
            OIDC_AUDIENCE: 'lead-email-finder-api',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects a malformed OIDC_JWKS_URI when provided', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { OIDC_JWKS_URI: 'not-a-url' })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('accepts an internal OIDC back-channel URL independently of the public issuer', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
            OIDC_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder/',
            OIDC_JWKS_URI: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it.each([
        '',
        'keycloak',
        'ftp://keycloak/realms/lead-email-finder',
        'http://user:secret@keycloak/realms/lead-email-finder',
        'http://keycloak/realms/lead-email-finder?secret=private',
        'http://keycloak/realms/lead-email-finder#private',
    ])('rejects an invalid OIDC back-channel URL %p', (value): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { OIDC_BACKCHANNEL_URL: value })

        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
            'OIDC_BACKCHANNEL_URL',
        )
    })

    it('accepts a valid BFF session configuration', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            APP_BASE_URL: 'http://localhost:53000',
            BFF_CLIENT_ID: 'lef-web-bff',
            BFF_CLIENT_SECRET: 'bff-secret',
            SESSION_ENCRYPTION_KEY: 'a-base64url-encoded-key',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects a malformed APP_BASE_URL', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { APP_BASE_URL: 'not-a-url' })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('rejects a configuration missing APP_BASE_URL, BFF_CLIENT_ID, BFF_CLIENT_SECRET, or SESSION_ENCRYPTION_KEY', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {})

        const errors = validateSync(environment).map(error => error.property)

        expect(errors).toEqual(
            expect.arrayContaining(['APP_BASE_URL', 'BFF_CLIENT_ID', 'BFF_CLIENT_SECRET', 'SESSION_ENCRYPTION_KEY']),
        )
    })

    it('transforms session timeout values from environment variables', (): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            {
                SESSION_IDLE_TIMEOUT_MS: '28800000',
                SESSION_ABSOLUTE_TIMEOUT_MS: '86400000',
            },
            { enableImplicitConversion: true },
        )

        expect(environment.SESSION_IDLE_TIMEOUT_MS).toBe(28_800_000)
        expect(environment.SESSION_ABSOLUTE_TIMEOUT_MS).toBe(86_400_000)
    })

    it('leaves session timeouts undefined when not configured', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {}, { enableImplicitConversion: true })

        expect(environment.SESSION_IDLE_TIMEOUT_MS).toBeUndefined()
        expect(environment.SESSION_ABSOLUTE_TIMEOUT_MS).toBeUndefined()
    })

    it('accepts a valid Keycloak organization administration client configuration', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            KEYCLOAK_ORG_ADMIN_CLIENT_ID: 'lef-org-admin-service',
            KEYCLOAK_ORG_ADMIN_CLIENT_SECRET: 'org-admin-secret',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects a configuration missing KEYCLOAK_ORG_ADMIN_CLIENT_ID or KEYCLOAK_ORG_ADMIN_CLIENT_SECRET', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {})

        const errors = validateSync(environment).map(error => error.property)

        expect(errors).toEqual(
            expect.arrayContaining(['KEYCLOAK_ORG_ADMIN_CLIENT_ID', 'KEYCLOAK_ORG_ADMIN_CLIENT_SECRET']),
        )
    })

    it('rejects a malformed KEYCLOAK_ADMIN_API_BASE_URL when provided', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, { KEYCLOAK_ADMIN_API_BASE_URL: 'not-a-url' })

        expect(validateSync(environment, { skipMissingProperties: true })).not.toHaveLength(0)
    })

    it('accepts a valid stub payments configuration', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_PROVIDER: 'stub',
            PAYMENTS_CREDIT_PACKS: JSON.stringify({
                starter: { credits: 100, amountMinor: 500, currency: 'USD', providerPriceId: 'price_stub' },
            }),
            PAYMENTS_CHECKOUT_URL: 'http://localhost:53000/billing/complete',
            PAYMENTS_STUB_WEBHOOK_SECRET: 'development-only-secret',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it.each([
        {
            name: 'the canonical checkout URL only',
            configuration: { PAYMENTS_CHECKOUT_URL: 'http://localhost:57000/checkout.html' },
        },
        {
            name: 'the canonical checkout URL with an explicitly undefined removed alias',
            configuration: {
                PAYMENTS_CHECKOUT_URL: 'http://localhost:57000/checkout.html',
                PAYMENTS_CHECKOUT_RETURN_URL: undefined,
            },
        },
    ])('normalizes and accepts $name', ({ configuration }): void => {
        const normalized = normalizeEnvironmentConfiguration(configuration)
        const environment = plainToInstance(EnvironmentVariablesDto, normalized)

        expect(normalized).toBe(configuration)
        expect(environment.PAYMENTS_CHECKOUT_URL).toBe('http://localhost:57000/checkout.html')
        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    describe.each([
        ['absent', undefined],
        ['valid', 'http://localhost:57000/checkout.html'],
        ['invalid', 'invalid-canonical-url'],
    ])('when the canonical checkout URL is %s', (_name, checkoutUrl): void => {
        it.each([
            'http://localhost:57000/checkout.html',
            'http://localhost:53000/billing/complete',
            '',
            null,
            'invalid-removed-url',
        ])('rejects the defined removed alias %p without disclosing configured values', removedUrl => {
            expect(() =>
                normalizeEnvironmentConfiguration({
                    PAYMENTS_CHECKOUT_URL: checkoutUrl,
                    PAYMENTS_CHECKOUT_RETURN_URL: removedUrl,
                }),
            ).toThrow(new Error('PAYMENTS_CHECKOUT_RETURN_URL: removed; use PAYMENTS_CHECKOUT_URL'))
        })
    })

    it.each([
        ['missing', {}],
        ['invalid', { PAYMENTS_CHECKOUT_URL: 'not-a-url' }],
    ])('rejects a %s canonical checkout URL during DTO validation', (_name, configuration): void => {
        const normalized = normalizeEnvironmentConfiguration(configuration)
        const environment = plainToInstance(EnvironmentVariablesDto, normalized)

        expect(validateSync(environment).map(error => error.property)).toContain('PAYMENTS_CHECKOUT_URL')
    })

    it('accepts the nonsecret checkout origin list as a string', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_CHECKOUT_ALLOWED_ORIGINS: 'https://checkout.example.test,https://sandbox-checkout.paddle.com',
        })
        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects a nonstring checkout origin input', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_CHECKOUT_ALLOWED_ORIGINS: ['https://checkout.example.test'],
        })
        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
            'PAYMENTS_CHECKOUT_ALLOWED_ORIGINS',
        )
    })

    it('requires the stub webhook secret only for the stub provider', (): void => {
        const stubEnvironment = plainToInstance(EnvironmentVariablesDto, { PAYMENTS_PROVIDER: 'stub' })
        const paddleEnvironment = plainToInstance(EnvironmentVariablesDto, { PAYMENTS_PROVIDER: 'paddle' })

        const stubErrors = validateSync(stubEnvironment).map(error => error.property)
        const paddleErrors = validateSync(paddleEnvironment).map(error => error.property)

        expect(stubErrors).toContain('PAYMENTS_STUB_WEBHOOK_SECRET')
        expect(paddleErrors).not.toContain('PAYMENTS_STUB_WEBHOOK_SECRET')
        expect(paddleErrors).not.toContain('PAYMENTS_STUB_WEBHOOK_SECRET_FILE')
    })

    it('accepts a valid Paddle sandbox configuration', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_PROVIDER: 'paddle',
            PADDLE_API_KEY: 'paddle-test-api-key',
            PADDLE_WEBHOOK_SECRET: 'paddle-test-webhook-secret',
            PADDLE_ENVIRONMENT: 'sandbox',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('requires Paddle secrets and environment only for the Paddle provider', (): void => {
        const paddleEnvironment = plainToInstance(EnvironmentVariablesDto, { PAYMENTS_PROVIDER: 'paddle' })
        const stubEnvironment = plainToInstance(EnvironmentVariablesDto, { PAYMENTS_PROVIDER: 'stub' })

        const paddleErrors = validateSync(paddleEnvironment).map(error => error.property)
        const stubErrors = validateSync(stubEnvironment).map(error => error.property)

        expect(paddleErrors).toEqual(
            expect.arrayContaining(['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET', 'PADDLE_ENVIRONMENT']),
        )
        expect(stubErrors).not.toContain('PADDLE_API_KEY')
        expect(stubErrors).not.toContain('PADDLE_API_KEY_FILE')
        expect(stubErrors).not.toContain('PADDLE_WEBHOOK_SECRET')
        expect(stubErrors).not.toContain('PADDLE_WEBHOOK_SECRET_FILE')
        expect(stubErrors).not.toContain('PADDLE_ENVIRONMENT')
    })

    it('accepts secret files for the Paddle provider', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_PROVIDER: 'paddle',
            PADDLE_API_KEY_FILE: '/run/secrets/paddle_api_key',
            PADDLE_WEBHOOK_SECRET_FILE: '/run/secrets/paddle_webhook_secret',
            PADDLE_ENVIRONMENT: 'sandbox',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects non-sandbox Paddle environments', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_PROVIDER: 'paddle',
            PADDLE_API_KEY: 'paddle-test-api-key',
            PADDLE_WEBHOOK_SECRET: 'paddle-test-webhook-secret',
            PADDLE_ENVIRONMENT: 'production',
        })

        expect(validateSync(environment, { skipMissingProperties: true }).map(error => error.property)).toContain(
            'PADDLE_ENVIRONMENT',
        )
    })

    it('accepts a secret file for the stub provider', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {
            PAYMENTS_PROVIDER: 'stub',
            PAYMENTS_STUB_WEBHOOK_SECRET_FILE: '/run/secrets/payments_stub_webhook_secret',
        })

        expect(validateSync(environment, { skipMissingProperties: true })).toHaveLength(0)
    })

    it('rejects missing required payments configuration', (): void => {
        const environment = plainToInstance(EnvironmentVariablesDto, {})

        const errors = validateSync(environment).map(error => error.property)

        expect(errors).toEqual(
            expect.arrayContaining(['PAYMENTS_PROVIDER', 'PAYMENTS_CREDIT_PACKS', 'PAYMENTS_CHECKOUT_URL']),
        )
    })
})
