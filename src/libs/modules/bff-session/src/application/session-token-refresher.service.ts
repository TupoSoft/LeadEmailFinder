import { Inject, Injectable, Optional } from '@nestjs/common'
import { SessionRecord } from '../domain/session-record'
import { OAUTH_PROVIDER_CLIENT, OAuthProviderClient } from './oauth-provider-client'

export class SessionRefreshFailedError extends Error {
    constructor() {
        super('Failed to refresh the session; the refresh token is expired or revoked')
        this.name = 'SessionRefreshFailedError'
    }
}

@Injectable()
export class SessionTokenRefresher {
    public static readonly DEFAULT_REFRESH_SKEW_MS = 60_000

    constructor(
        @Inject(OAUTH_PROVIDER_CLIENT) private readonly oauthProviderClient: OAuthProviderClient,
        @Optional() private readonly refreshSkewMs = SessionTokenRefresher.DEFAULT_REFRESH_SKEW_MS,
    ) {}

    async refreshIfNeeded(record: SessionRecord): Promise<SessionRecord> {
        if (record.accessTokenExpiresAt - Date.now() > this.refreshSkewMs) {
            return record
        }

        try {
            const refreshed = await this.oauthProviderClient.refreshTokens(record.refreshToken)

            return {
                ...record,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                accessTokenExpiresAt: Date.now() + refreshed.accessTokenExpiresInSeconds * 1000,
                refreshTokenExpiresAt:
                    refreshed.refreshTokenExpiresInSeconds !== null
                        ? Date.now() + refreshed.refreshTokenExpiresInSeconds * 1000
                        : null,
            }
        } catch {
            throw new SessionRefreshFailedError()
        }
    }
}
