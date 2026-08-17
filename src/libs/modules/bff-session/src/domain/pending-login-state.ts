export interface PendingLoginState {
    readonly nonce: string
    readonly codeVerifier: string
    readonly redirectUri: string
    readonly createdAt: number
}
