import { Inject, Injectable } from '@nestjs/common'
import { createRemoteJWKSet, errors, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose'
import { OidcTokenRejectedError, OidcTokenVerifier, VerifiedOidcToken } from '../../application/oidc-token-verifier'
import { OIDC_CONFIGURATION, OidcConfiguration } from './oidc-configuration'

class JwkResolutionError extends Error {
    constructor(readonly cause: unknown) {
        super('OIDC key resolution failed')
        this.name = 'JwkResolutionError'
    }
}

@Injectable()
export class JoseOidcTokenVerifier implements OidcTokenVerifier {
    private jwks: JWTVerifyGetKey | undefined

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
            if (error instanceof OidcTokenRejectedError) {
                throw error
            }

            if (error instanceof JwkResolutionError) {
                if (this.isExpectedKeySelectionRejection(error.cause)) {
                    throw new OidcTokenRejectedError()
                }

                throw error.cause
            }

            if (this.isExpectedTokenRejection(error)) {
                throw new OidcTokenRejectedError()
            }

            throw error
        }
    }

    private getJwks(): JWTVerifyGetKey {
        if (!this.jwks) {
            const remoteJwks = createRemoteJWKSet(new URL(this.configuration.jwksUri), {
                cooldownDuration: 30_000,
                timeoutDuration: 5_000,
            })
            this.jwks = async (protectedHeader, token) => {
                try {
                    return await remoteJwks(protectedHeader, token)
                } catch (error) {
                    throw new JwkResolutionError(error)
                }
            }
        }

        return this.jwks
    }

    private toVerifiedToken(payload: JWTPayload): VerifiedOidcToken {
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new OidcTokenRejectedError()
        }

        return { issuer: this.configuration.issuer, subject: payload.sub }
    }

    private isExpectedTokenRejection(error: unknown): boolean {
        return (
            error instanceof errors.JWTClaimValidationFailed ||
            error instanceof errors.JWTExpired ||
            error instanceof errors.JOSEAlgNotAllowed ||
            error instanceof errors.JOSENotSupported ||
            error instanceof errors.JWSInvalid ||
            error instanceof errors.JWTInvalid ||
            error instanceof errors.JWSSignatureVerificationFailed
        )
    }

    private isExpectedKeySelectionRejection(error: unknown): boolean {
        return error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys
    }
}
