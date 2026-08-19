import { ConfigService } from '@nestjs/config'

export const OIDC_CONFIGURATION = Symbol('OIDC_CONFIGURATION')

export interface OidcConfiguration {
    readonly issuer: string
    readonly audience: string
    readonly jwksUri: string
}

export function createOidcConfiguration(configService: ConfigService): OidcConfiguration {
    const issuer = configService.getOrThrow<string>('OIDC_ISSUER_URL')
    const audience = configService.getOrThrow<string>('OIDC_AUDIENCE')

    // The issuer claim a token must carry (and the browser-facing redirect KeycloakOAuthClient builds from
    // this same OIDC_ISSUER_URL) is independent of where THIS server can actually reach Keycloak to fetch its
    // signing keys: the containerized api service cannot reach Keycloak via the host-facing OIDC_ISSUER_URL
    // (e.g. http://localhost:58080/...) from inside its own Docker network namespace, but a token minted by
    // any client hitting that same host-facing URL still carries iss: http://localhost:58080/... regardless
    // of which server-reachable path this process fetches JWKS from. OIDC_JWKS_URI lets the container fetch
    // keys via a reachable path (e.g. http://keycloak:8080/.../certs) while the issuer claim check and the
    // browser redirect both keep using the host-facing value.
    const jwksUri = configService.get<string>('OIDC_JWKS_URI') ?? `${issuer}/protocol/openid-connect/certs`

    return {
        issuer,
        audience,
        jwksUri,
    }
}
