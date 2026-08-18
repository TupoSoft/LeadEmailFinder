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

    return {
        baseUrl: issuer.replace(/\/realms\/.+$/, ''),
        realm: issuer.split('/realms/')[1],
        clientId: configService.getOrThrow<string>('KEYCLOAK_ORG_ADMIN_CLIENT_ID'),
        clientSecret: configService.getOrThrow<string>('KEYCLOAK_ORG_ADMIN_CLIENT_SECRET'),
    }
}
