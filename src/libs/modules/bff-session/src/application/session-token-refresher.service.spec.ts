import { SessionRecord } from '../domain/session-record'
import { OAuthProviderClient } from './oauth-provider-client'
import { SessionRefreshFailedError, SessionTokenRefresher } from './session-token-refresher.service'

function sampleRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        externalIdentityId: 'identity-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'subject-1',
        csrfToken: 'csrf-token',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshTokenExpiresAt: Date.now() + 120_000,
        absoluteExpiresAt: Date.now() + 86_400_000,
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('SessionTokenRefresher', () => {
    let oauthProviderClient: jest.Mocked<OAuthProviderClient>
    let refresher: SessionTokenRefresher

    beforeEach(() => {
        oauthProviderClient = {
            buildAuthorizationUrl: jest.fn(),
            exchangeAuthorizationCode: jest.fn(),
            refreshTokens: jest.fn(),
            revokeSession: jest.fn(),
        }
        refresher = new SessionTokenRefresher(oauthProviderClient, 60_000)
    })

    it('returns the record unchanged when the access token is not near expiry', async () => {
        const record = sampleRecord({ accessTokenExpiresAt: Date.now() + 10 * 60_000 })

        const result = await refresher.refreshIfNeeded(record)

        expect(result).toBe(record)
        expect(oauthProviderClient.refreshTokens).not.toHaveBeenCalled()
    })

    it('refreshes and returns an updated record when the access token is near expiry', async () => {
        const record = sampleRecord({ accessTokenExpiresAt: Date.now() + 1000 })
        oauthProviderClient.refreshTokens.mockResolvedValue({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            accessTokenExpiresInSeconds: 300,
            refreshTokenExpiresInSeconds: 1800,
        })

        const result = await refresher.refreshIfNeeded(record)

        expect(oauthProviderClient.refreshTokens).toHaveBeenCalledWith('refresh-token')
        expect(result.accessToken).toBe('new-access')
        expect(result.refreshToken).toBe('new-refresh')
        expect(result.accessTokenExpiresAt).toBeGreaterThan(Date.now())
        expect(result.organizationId).toBe(record.organizationId)
    })

    it('throws SessionRefreshFailedError when the refresh token is dead', async () => {
        const record = sampleRecord({ accessTokenExpiresAt: Date.now() - 1000 })
        oauthProviderClient.refreshTokens.mockRejectedValue(new Error('invalid_grant'))

        await expect(refresher.refreshIfNeeded(record)).rejects.toThrow(SessionRefreshFailedError)
    })
})
