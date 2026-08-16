import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose'
import { OidcTokenVerifier, VerifiedOidcToken } from '../../application/oidc-token-verifier'
import { OIDC_CONFIGURATION, OidcConfiguration } from './oidc-configuration'

type RemoteJwkSet = ReturnType<typeof createRemoteJWKSet>

@Injectable()
export class JoseOidcTokenVerifier implements OidcTokenVerifier {
    private jwks: RemoteJwkSet | undefined

    constructor(@Inject(OIDC_CONFIGURATION) private readonly configuration: OidcConfiguration) {}

    async verify(token: string): Promise<VerifiedOidcToken> {
        try {
            const { payload } = await jwtVerify(token, this.getJwks(), {
                issuer: this.configuration.issuer,
                audience: this.configuration.audience,
                algorithms: ['RS256'],
                typ: 'JWT',
            })

            return this.toVerifiedToken(payload)
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error
            }

            throw new UnauthorizedException('OIDC access token is invalid')
        }
    }

    private getJwks(): RemoteJwkSet {
        if (!this.jwks) {
            this.jwks = createRemoteJWKSet(new URL(this.configuration.jwksUri), {
                cooldownDuration: 30_000,
                timeoutDuration: 5_000,
            })
        }

        return this.jwks
    }

    private toVerifiedToken(payload: JWTPayload): VerifiedOidcToken {
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new UnauthorizedException('OIDC access token is missing a subject claim')
        }

        return { issuer: this.configuration.issuer, subject: payload.sub }
    }
}
