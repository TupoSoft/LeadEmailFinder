export type SessionLineage = { readonly kind: 'fresh' } | { readonly kind: 'replace'; readonly sessionId: string }

export interface PendingLoginState {
    readonly nonce: string
    readonly codeVerifier: string
    readonly redirectUri: string
    readonly destination: string
    readonly sessionLineage: SessionLineage
    readonly createdAt: number
}
