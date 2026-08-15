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

    return {
        issuer,
        audience,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
    }
}
