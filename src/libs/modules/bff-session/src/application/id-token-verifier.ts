export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER')

export interface VerifiedIdToken {
    readonly issuer: string
    readonly subject: string
    readonly email: string | null
}

export interface IdTokenVerifier {
    verify(idToken: string, expectedNonce: string): Promise<VerifiedIdToken>
}
