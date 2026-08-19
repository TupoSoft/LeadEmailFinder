import { ConfigService } from '@nestjs/config'

export const KEYCLOAK_ADMIN_HTTP_CONFIGURATION = Symbol('KEYCLOAK_ADMIN_HTTP_CONFIGURATION')

export interface KeycloakAdminHttpConfiguration {
    readonly baseUrl: string
    readonly realm: string
    readonly clientId: string
    readonly clientSecret: string
}

export function createKeycloakAdminHttpConfiguration(configService: ConfigService): KeycloakAdminHttpConfiguration {
    const issuer = configService.getOrThrow<string>('OIDC_ISSUER_URL')
    // OIDC_ISSUER_URL is host-facing (browser redirect target, token issuer-claim check) and is unreachable
    // from inside this container's own network namespace. KEYCLOAK_ADMIN_API_BASE_URL lets this server reach
    // Keycloak's Admin REST API via a container-reachable path instead, independently of that host-facing
    // value — same reasoning as OIDC_JWKS_URI in oidc-configuration.ts.
    const adminApiBaseUrl = configService.get<string>('KEYCLOAK_ADMIN_API_BASE_URL')

    return {
        baseUrl: adminApiBaseUrl ?? issuer.replace(/\/realms\/.+$/, ''),
        realm: issuer.split('/realms/')[1],
        clientId: configService.getOrThrow<string>('KEYCLOAK_ORG_ADMIN_CLIENT_ID'),
        clientSecret: configService.getOrThrow<string>('KEYCLOAK_ORG_ADMIN_CLIENT_SECRET'),
    }
}
