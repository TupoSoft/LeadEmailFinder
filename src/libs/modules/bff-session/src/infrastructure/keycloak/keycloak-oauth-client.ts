import { Inject, Injectable, Logger } from '@nestjs/common'
import {
    ExchangeAuthorizationCodeRequest,
    OAuthProviderClient,
    OAuthTokenResponse,
    RefreshedTokens,
} from '../../application/oauth-provider-client'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../../application/bff-session-configuration'

export class OAuthTokenExchangeFailedError extends Error {
    constructor(reason: string) {
        super(`OAuth token exchange failed: ${reason}`)
        this.name = 'OAuthTokenExchangeFailedError'
    }
}

interface KeycloakTokenResponse {
    id_token?: string
    access_token?: string
    refresh_token?: string
    expires_in?: number
    refresh_expires_in?: number
    error?: string
    error_description?: string
}

@Injectable()
export class KeycloakOAuthClient implements OAuthProviderClient {
    private readonly logger = new Logger(KeycloakOAuthClient.name)

    constructor(@Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration) {}

    buildAuthorizationUrl(params: {
        readonly redirectUri: string
        readonly state: string
        readonly nonce: string
        readonly codeChallenge: string
    }): string {
        const url = new URL(`${this.configuration.issuer}/protocol/openid-connect/auth`)
        url.search = new URLSearchParams({
            client_id: this.configuration.clientId,
            redirect_uri: params.redirectUri,
            response_type: 'code',
            scope: 'openid',
            state: params.state,
            nonce: params.nonce,
            code_challenge: params.codeChallenge,
            code_challenge_method: 'S256',
        }).toString()

        return url.toString()
    }

    async exchangeAuthorizationCode(request: ExchangeAuthorizationCodeRequest): Promise<OAuthTokenResponse> {
        const response = await this.postToken({
            grant_type: 'authorization_code',
            code: request.code,
            redirect_uri: request.redirectUri,
            code_verifier: request.codeVerifier,
        })

        if (!response.id_token || !response.access_token || !response.refresh_token) {
            throw new OAuthTokenExchangeFailedError('response is missing required tokens')
        }

        return {
            idToken: response.id_token,
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            accessTokenExpiresInSeconds: response.expires_in ?? 0,
            refreshTokenExpiresInSeconds: response.refresh_expires_in ?? null,
        }
    }

    async refreshTokens(refreshToken: string): Promise<RefreshedTokens> {
        const response = await this.postToken({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        })

        if (!response.access_token || !response.refresh_token) {
            throw new OAuthTokenExchangeFailedError('refresh response is missing required tokens')
        }

        return {
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            accessTokenExpiresInSeconds: response.expires_in ?? 0,
            refreshTokenExpiresInSeconds: response.refresh_expires_in ?? null,
        }
    }

    async revokeSession(refreshToken: string): Promise<void> {
        try {
            await fetch(`${this.configuration.issuer}/protocol/openid-connect/logout`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.configuration.clientId,
                    client_secret: this.configuration.clientSecret,
                    refresh_token: refreshToken,
                }),
            })
        } catch (error) {
            this.logger.warn(`Failed to revoke the Keycloak session; proceeding with local logout: ${String(error)}`)
        }
    }

    private async postToken(params: Record<string, string>): Promise<KeycloakTokenResponse> {
        const response = await fetch(`${this.configuration.issuer}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.configuration.clientId,
                client_secret: this.configuration.clientSecret,
                ...params,
            }),
        })

        const payload = (await response.json().catch(() => ({}))) as KeycloakTokenResponse

        if (!response.ok) {
            throw new OAuthTokenExchangeFailedError(payload.error_description ?? payload.error ?? `HTTP ${response.status}`)
        }

        return payload
    }
}
