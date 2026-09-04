export const OIDC_TOKEN_VERIFIER = Symbol('OIDC_TOKEN_VERIFIER')

export interface VerifiedOidcToken {
    readonly issuer: string
    readonly subject: string
}

export interface OidcTokenVerifier {
    verify(token: string): Promise<VerifiedOidcToken>
}

/** Expected rejection of a presented OIDC token. Infrastructure failures must use their original error. */
export class OidcTokenRejectedError extends Error {
    constructor() {
        super('OIDC access token is invalid')
        this.name = 'OidcTokenRejectedError'
    }
}
