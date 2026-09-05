import { Inject, Injectable, Logger } from '@nestjs/common'
import {
    AuthorizationCodeGrantRejectedError,
    ExchangeAuthorizationCodeRequest,
    OAuthProviderClient,
    OAuthTokenResponse,
    RefreshedTokens,
} from '../../application/oauth-provider-client'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../../application/bff-session-configuration'

export class OAuthTokenRequestFailedError extends Error {
    constructor() {
        super('OAuth provider token request failed')
        this.name = 'OAuthTokenRequestFailedError'
    }
}

interface KeycloakTokenResponse {
    readonly id_token?: unknown
    readonly access_token?: unknown
    readonly refresh_token?: unknown
    readonly expires_in?: unknown
    readonly refresh_expires_in?: unknown
    readonly error?: unknown
}

type TokenRequest =
    | {
          readonly grant_type: 'authorization_code'
          readonly code: string
          readonly redirect_uri: string
          readonly code_verifier: string
      }
    | { readonly grant_type: 'refresh_token'; readonly refresh_token: string }

function isJsonObject(value: unknown): value is KeycloakTokenResponse {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isOptionalLifetime(value: unknown): value is number | undefined {
    return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
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

        if (
            !isNonEmptyString(response.id_token) ||
            !isNonEmptyString(response.access_token) ||
            !isNonEmptyString(response.refresh_token) ||
            !isOptionalLifetime(response.expires_in) ||
            !isOptionalLifetime(response.refresh_expires_in)
        ) {
            throw new OAuthTokenRequestFailedError()
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

        if (
            !isNonEmptyString(response.access_token) ||
            !isNonEmptyString(response.refresh_token) ||
            !isOptionalLifetime(response.expires_in) ||
            !isOptionalLifetime(response.refresh_expires_in)
        ) {
            throw new OAuthTokenRequestFailedError()
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
            await fetch(`${this.configuration.backchannelUrl}/protocol/openid-connect/logout`, {
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

    private async postToken(params: TokenRequest): Promise<KeycloakTokenResponse> {
        const response = await fetch(`${this.configuration.backchannelUrl}/protocol/openid-connect/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.configuration.clientId,
                client_secret: this.configuration.clientSecret,
                ...params,
            }),
        })

        let payload: unknown
        try {
            payload = await response.json()
        } catch {
            throw new OAuthTokenRequestFailedError()
        }

        if (!isJsonObject(payload)) {
            throw new OAuthTokenRequestFailedError()
        }

        if (!response.ok) {
            if (
                params.grant_type === 'authorization_code' &&
                response.status === 400 &&
                payload.error === 'invalid_grant'
            ) {
                throw new AuthorizationCodeGrantRejectedError()
            }

            throw new OAuthTokenRequestFailedError()
        }

        return payload
    }
}
