export const OAUTH_PROVIDER_CLIENT = Symbol('OAUTH_PROVIDER_CLIENT')

export interface ExchangeAuthorizationCodeRequest {
    readonly code: string
    readonly redirectUri: string
    readonly codeVerifier: string
}

export interface OAuthTokenResponse {
    readonly idToken: string
    readonly accessToken: string
    readonly refreshToken: string
    readonly accessTokenExpiresInSeconds: number
    readonly refreshTokenExpiresInSeconds: number | null
}

export interface RefreshedTokens {
    readonly accessToken: string
    readonly refreshToken: string
    readonly accessTokenExpiresInSeconds: number
    readonly refreshTokenExpiresInSeconds: number | null
}

export interface OAuthProviderClient {
    buildAuthorizationUrl(params: {
        readonly redirectUri: string
        readonly state: string
        readonly nonce: string
        readonly codeChallenge: string
    }): string

    exchangeAuthorizationCode(request: ExchangeAuthorizationCodeRequest): Promise<OAuthTokenResponse>

    refreshTokens(refreshToken: string): Promise<RefreshedTokens>

    revokeSession(refreshToken: string): Promise<void>
}
