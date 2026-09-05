import { Inject, Injectable } from '@nestjs/common'
import { createRemoteJWKSet, errors, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose'
import { IdTokenVerificationFailedError, IdTokenVerifier, VerifiedIdToken } from '../../application/id-token-verifier'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../../application/bff-session-configuration'

class JwkResolutionError extends Error {
    constructor(readonly cause: unknown) {
        super('ID token key resolution failed')
        this.name = 'JwkResolutionError'
    }
}

@Injectable()
export class JoseIdTokenVerifier implements IdTokenVerifier {
    private jwks: JWTVerifyGetKey | undefined

    constructor(@Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration) {}

    async verify(idToken: string, expectedNonce: string): Promise<VerifiedIdToken> {
        try {
            const { payload } = await jwtVerify(idToken, this.getJwks(), {
                issuer: this.configuration.issuer,
                audience: this.configuration.clientId,
                algorithms: ['RS256'],
                typ: 'JWT',
                requiredClaims: ['exp'],
            })

            return this.toVerifiedIdToken(payload, expectedNonce)
        } catch (error) {
            if (error instanceof IdTokenVerificationFailedError) {
                throw error
            }

            if (error instanceof JwkResolutionError) {
                if (this.isExpectedKeySelectionRejection(error.cause)) {
                    throw new IdTokenVerificationFailedError()
                }

                throw error.cause
            }

            if (this.isExpectedTokenRejection(error)) {
                throw new IdTokenVerificationFailedError()
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

    private toVerifiedIdToken(payload: JWTPayload, expectedNonce: string): VerifiedIdToken {
        const audiences = typeof payload.aud === 'string' ? [payload.aud] : payload.aud
        if (
            !Array.isArray(audiences) ||
            audiences.length !== 1 ||
            audiences[0] !== this.configuration.clientId ||
            (payload.azp !== undefined && payload.azp !== this.configuration.clientId)
        ) {
            throw new IdTokenVerificationFailedError()
        }

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
            throw new IdTokenVerificationFailedError()
        }

        if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
            throw new IdTokenVerificationFailedError()
        }

        if (payload.email !== undefined && payload.email !== null && typeof payload.email !== 'string') {
            throw new IdTokenVerificationFailedError()
        }

        return {
            issuer: this.configuration.issuer,
            subject: payload.sub,
            email: payload.email ?? null,
        }
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
