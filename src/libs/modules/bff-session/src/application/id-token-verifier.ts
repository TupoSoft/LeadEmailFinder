export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER')

export interface VerifiedIdToken {
    readonly issuer: string
    readonly subject: string
    readonly email: string | null
}

export interface IdTokenVerifier {
    verify(idToken: string, expectedNonce: string): Promise<VerifiedIdToken>
}

/** ID-token integrity or claim validation failed. Infrastructure failures must use their original error. */
export class IdTokenVerificationFailedError extends Error {
    constructor() {
        super('ID token verification failed')
        this.name = 'IdTokenVerificationFailedError'
    }
}
