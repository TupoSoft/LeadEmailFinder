import { ConfigService } from '@nestjs/config'
import { createKeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'

function configServiceStub(values: Record<string, string | undefined>): ConfigService {
    return {
        getOrThrow: (key: string) => {
            const value = values[key]
            if (value === undefined) {
                throw new Error(`Missing required config value: ${key}`)
            }
            return value
        },
        get: (key: string) => values[key],
    } as unknown as ConfigService
}

describe('createKeycloakAdminHttpConfiguration', () => {
    it('derives baseUrl from the issuer when KEYCLOAK_ADMIN_API_BASE_URL is not set', () => {
        const configuration = createKeycloakAdminHttpConfiguration(
            configServiceStub({
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                KEYCLOAK_ORG_ADMIN_CLIENT_ID: 'lef-org-admin-service',
                KEYCLOAK_ORG_ADMIN_CLIENT_SECRET: 'secret',
            }),
        )

        expect(configuration.baseUrl).toBe('http://localhost:58080')
        expect(configuration.realm).toBe('lead-email-finder')
    })

    it('uses KEYCLOAK_ADMIN_API_BASE_URL when set, independently of the issuer', () => {
        const configuration = createKeycloakAdminHttpConfiguration(
            configServiceStub({
                OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder',
                KEYCLOAK_ADMIN_API_BASE_URL: 'http://keycloak:8080',
                KEYCLOAK_ORG_ADMIN_CLIENT_ID: 'lef-org-admin-service',
                KEYCLOAK_ORG_ADMIN_CLIENT_SECRET: 'secret',
            }),
        )

        expect(configuration.baseUrl).toBe('http://keycloak:8080')
        expect(configuration.realm).toBe('lead-email-finder')
    })
})
