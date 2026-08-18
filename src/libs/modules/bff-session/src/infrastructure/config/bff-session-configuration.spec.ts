import { ConfigService } from '@nestjs/config'
import { createBffSessionConfiguration } from './bff-session-configuration'

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
