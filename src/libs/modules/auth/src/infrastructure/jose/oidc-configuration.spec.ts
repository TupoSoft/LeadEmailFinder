import { ConfigService } from '@nestjs/config'
import { createOidcConfiguration } from './oidc-configuration'

describe('createOidcConfiguration', () => {
    it('derives jwksUri from the issuer when OIDC_JWKS_URI is not set', () => {
        const configService = {
            getOrThrow: (key: string) =>
                ({ OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder', OIDC_AUDIENCE: 'lead-email-finder-api' })[key],
            get: () => undefined,
        } as unknown as ConfigService

        const configuration = createOidcConfiguration(configService)

        expect(configuration).toEqual({
            issuer: 'http://localhost:58080/realms/lead-email-finder',
            audience: 'lead-email-finder-api',
            jwksUri: 'http://localhost:58080/realms/lead-email-finder/protocol/openid-connect/certs',
        })
    })

    it('uses OIDC_JWKS_URI when set, independently of the issuer used for the claim check', () => {
        const configService = {
            getOrThrow: (key: string) =>
                ({ OIDC_ISSUER_URL: 'http://localhost:58080/realms/lead-email-finder', OIDC_AUDIENCE: 'lead-email-finder-api' })[key],
            get: (key: string) =>
                key === 'OIDC_JWKS_URI'
                    ? 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs'
                    : undefined,
        } as unknown as ConfigService

        const configuration = createOidcConfiguration(configService)

        expect(configuration.issuer).toBe('http://localhost:58080/realms/lead-email-finder')
        expect(configuration.jwksUri).toBe('http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs')
    })
})
