import { ConfigService } from '@nestjs/config'
import { createBffSessionConfiguration, createNativeBrowserSessionConfiguration } from './bff-session-configuration'

function configServiceWith(values: Record<string, unknown>): ConfigService {
    return {
        getOrThrow: (key: string) => {
            if (!(key in values)) {
                throw new Error(`Missing config value: ${key}`)
            }
            return values[key]
        },
        get: (key: string) => values[key],
    } as unknown as ConfigService
}

describe('createBffSessionConfiguration', () => {
    const values = {
        APP_BASE_URL: 'http://localhost:53000',
        OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
        BFF_CLIENT_ID: 'lef-web-bff',
        BFF_CLIENT_SECRET: 'secret',
    }

    it('uses the public issuer for both fallbacks when routing overrides are absent', () => {
        const configuration = createBffSessionConfiguration(configServiceWith(values))

        expect(configuration.issuer).toBe(values.OIDC_ISSUER_URL)
        expect(configuration.backchannelUrl).toBe(values.OIDC_ISSUER_URL)
        expect(configuration.jwksUri).toBe(`${values.OIDC_ISSUER_URL}/protocol/openid-connect/certs`)
    })

    it('normalizes realm bases and configures JWKS retrieval independently', () => {
        const configuration = createBffSessionConfiguration(
            configServiceWith({
                ...values,
                OIDC_ISSUER_URL: `${values.OIDC_ISSUER_URL}///`,
                OIDC_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder///',
                OIDC_JWKS_URI: 'http://keys:8080/custom/certs',
            }),
        )

        expect(configuration.issuer).toBe(values.OIDC_ISSUER_URL)
        expect(configuration.backchannelUrl).toBe('http://keycloak:8080/realms/lead-email-finder')
        expect(configuration.jwksUri).toBe('http://keys:8080/custom/certs')
    })

    it('derives JWKS from the normalized public issuer even when a back-channel URL is configured', () => {
        const configuration = createBffSessionConfiguration(
            configServiceWith({
                ...values,
                OIDC_ISSUER_URL: `${values.OIDC_ISSUER_URL}/`,
                OIDC_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder',
            }),
        )

        expect(configuration.jwksUri).toBe(`${values.OIDC_ISSUER_URL}/protocol/openid-connect/certs`)
    })

    describe.each(['OIDC_ISSUER_URL', 'OIDC_BACKCHANNEL_URL', 'OIDC_JWKS_URI'])('%s validation', key => {
        it.each([
            '',
            'keycloak',
            '/realms/lead-email-finder',
            'ftp://keycloak/realms/lead-email-finder',
            'http:///keycloak',
            'http://',
            'http://user:secret@keycloak/realms/lead-email-finder',
            'http://keycloak/realms/lead-email-finder?secret=private',
            'http://keycloak/realms/lead-email-finder#private',
            ' http://keycloak/realms/lead-email-finder',
            'http://keycloak/realms/lead-email-finder\n',
            'http://keycloak\\other/realms/lead-email-finder',
            null,
            42,
        ])('rejects invalid or incompatible value %p without exposing it', value => {
            const createConfiguration = (): unknown =>
                createBffSessionConfiguration(configServiceWith({ ...values, [key]: value }))

            expect(createConfiguration).toThrow(
                new Error(`${key} must be an absolute HTTP(S) URL without credentials, whitespace, query, or fragment`),
            )
        })
    })

    it('applies default idle and absolute timeouts when not configured', () => {
        const configuration = createBffSessionConfiguration(
            configServiceWith({
                APP_BASE_URL: 'http://localhost:53000',
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                BFF_CLIENT_ID: 'lef-web-bff',
                BFF_CLIENT_SECRET: 'secret',
            }),
        )

        expect(configuration.sessionIdleTimeoutMs).toBe(8 * 60 * 60 * 1000)
        expect(configuration.sessionAbsoluteTimeoutMs).toBe(24 * 60 * 60 * 1000)
    })

    it('uses configured timeouts when present', () => {
        const configuration = createBffSessionConfiguration(
            configServiceWith({
                APP_BASE_URL: 'http://localhost:53000',
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                BFF_CLIENT_ID: 'lef-web-bff',
                BFF_CLIENT_SECRET: 'secret',
                SESSION_IDLE_TIMEOUT_MS: 1000,
                SESSION_ABSOLUTE_TIMEOUT_MS: 2000,
            }),
        )

        expect(configuration.sessionIdleTimeoutMs).toBe(1000)
        expect(configuration.sessionAbsoluteTimeoutMs).toBe(2000)
    })

    it('marks the cookie insecure for an http base URL and secure for https', () => {
        const httpConfiguration = createBffSessionConfiguration(
            configServiceWith({
                APP_BASE_URL: 'http://localhost:53000',
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                BFF_CLIENT_ID: 'lef-web-bff',
                BFF_CLIENT_SECRET: 'secret',
            }),
        )
        const httpsConfiguration = createBffSessionConfiguration(
            configServiceWith({
                APP_BASE_URL: 'https://app.example.com',
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                BFF_CLIENT_ID: 'lef-web-bff',
                BFF_CLIENT_SECRET: 'secret',
            }),
        )

        expect(httpConfiguration.isSecureCookie).toBe(false)
        expect(httpsConfiguration.isSecureCookie).toBe(true)
    })
})

describe('native browser session configuration', () => {
    it('starts without any legacy OIDC or encryption settings', () => {
        expect(
            createNativeBrowserSessionConfiguration(configServiceWith({ APP_BASE_URL: 'https://app.example.test' })),
        ).toEqual({
            appBaseUrl: 'https://app.example.test',
            isSecureCookie: true,
            sessionIdleTimeoutMs: 8 * 60 * 60 * 1000,
            sessionAbsoluteTimeoutMs: 24 * 60 * 60 * 1000,
        })
    })

    it('retains configurable session durations', () => {
        const configuration = createNativeBrowserSessionConfiguration(
            configServiceWith({
                APP_BASE_URL: 'http://localhost:53000',
                SESSION_IDLE_TIMEOUT_MS: '1000',
                SESSION_ABSOLUTE_TIMEOUT_MS: 2000,
            }),
        )
        expect(configuration).toMatchObject({
            sessionIdleTimeoutMs: 1000,
            sessionAbsoluteTimeoutMs: 2000,
            isSecureCookie: false,
        })
    })

    it.each([0, -1, 'invalid', 1.5, ''])('rejects invalid timeouts (%p)', value => {
        expect(() =>
            createNativeBrowserSessionConfiguration(
                configServiceWith({
                    APP_BASE_URL: 'http://localhost:53000',
                    SESSION_ABSOLUTE_TIMEOUT_MS: value,
                }),
            ),
        ).toThrow('SESSION_ABSOLUTE_TIMEOUT_MS must be a positive integer')
    })
})
