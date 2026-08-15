export const OIDC_TOKEN_VERIFIER = Symbol('OIDC_TOKEN_VERIFIER')

export interface VerifiedOidcToken {
    readonly issuer: string
    readonly subject: string
}

export interface OidcTokenVerifier {
    verify(token: string): Promise<VerifiedOidcToken>
}
