import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose'
import { IdTokenVerifier, VerifiedIdToken } from '../../application/id-token-verifier'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../../application/bff-session-configuration'

type RemoteJwkSet = ReturnType<typeof createRemoteJWKSet>

@Injectable()
export class JoseIdTokenVerifier implements IdTokenVerifier {
    private jwks: RemoteJwkSet | undefined

    constructor(@Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration) {}

    async verify(idToken: string, expectedNonce: string): Promise<VerifiedIdToken> {
        let payload: JWTPayload

        try {
            const result = await jwtVerify(idToken, this.getJwks(), {
                issuer: this.configuration.issuer,
                audience: this.configuration.clientId,
                algorithms: ['RS256'],
                typ: 'JWT',
            })
            payload = result.payload
        } catch {
            throw new UnauthorizedException('ID token is invalid')
        }

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new UnauthorizedException('ID token is missing a subject claim')
        }

        if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
            throw new UnauthorizedException('ID token nonce is invalid')
        }

        return {
            issuer: this.configuration.issuer,
            subject: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : null,
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
}
