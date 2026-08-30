import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { KeycloakOAuthClient, OAuthTokenExchangeFailedError } from './keycloak-oauth-client'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'http://localhost:58080/realms/lead-email-finder',
    clientId: 'lef-web-bff',
    clientSecret: 'bff-secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

describe('KeycloakOAuthClient', () => {
    let client: KeycloakOAuthClient
    let fetchMock: jest.Mock

    beforeEach(() => {
        client = new KeycloakOAuthClient(configuration)
        fetchMock = jest.fn()
        global.fetch = fetchMock as never
    })

    describe('buildAuthorizationUrl', () => {
        it('builds a Keycloak authorization URL with PKCE, state, and nonce', () => {
            const url = client.buildAuthorizationUrl({
                redirectUri: 'http://localhost:53000/v1/auth/callback',
                state: 'the-state',
                nonce: 'the-nonce',
                codeChallenge: 'the-challenge',
            })

            const parsed = new URL(url)
            expect(parsed.origin + parsed.pathname).toBe(`${configuration.issuer}/protocol/openid-connect/auth`)
            expect(parsed.searchParams.get('response_type')).toBe('code')
            expect(parsed.searchParams.get('client_id')).toBe('lef-web-bff')
            expect(parsed.searchParams.get('state')).toBe('the-state')
            expect(parsed.searchParams.get('nonce')).toBe('the-nonce')
            expect(parsed.searchParams.get('code_challenge')).toBe('the-challenge')
            expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
        })
    })

    describe('exchangeAuthorizationCode', () => {
        it('returns tokens from a successful exchange', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id_token: 'id-token',
                        access_token: 'access-token',
                        refresh_token: 'refresh-token',
                        expires_in: 300,
                        refresh_expires_in: 1800,
                    }),
            })

            const result = await client.exchangeAuthorizationCode({
                code: 'auth-code',
                redirectUri: 'http://localhost:53000/v1/auth/callback',
                codeVerifier: 'verifier',
            })

            expect(result).toEqual({
                idToken: 'id-token',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                accessTokenExpiresInSeconds: 300,
                refreshTokenExpiresInSeconds: 1800,
            })
        })

        it('throws when Keycloak rejects the exchange (e.g. wrong PKCE verifier)', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'PKCE verification failed' }),
            })

            await expect(
                client.exchangeAuthorizationCode({
                    code: 'auth-code',
                    redirectUri: 'http://localhost:53000/v1/auth/callback',
                    codeVerifier: 'wrong-verifier',
                }),
            ).rejects.toThrow(OAuthTokenExchangeFailedError)
        })

        it('throws when the response is missing required tokens', async () => {
            fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

            await expect(
                client.exchangeAuthorizationCode({
                    code: 'auth-code',
                    redirectUri: 'http://localhost:53000/v1/auth/callback',
                    codeVerifier: 'verifier',
                }),
            ).rejects.toThrow(OAuthTokenExchangeFailedError)
        })
    })

    describe('refreshTokens', () => {
        it('returns refreshed tokens on success', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 300, refresh_expires_in: 1800 }),
            })

            const result = await client.refreshTokens('old-refresh')

            expect(result).toEqual({
                accessToken: 'new-access',
                refreshToken: 'new-refresh',
                accessTokenExpiresInSeconds: 300,
                refreshTokenExpiresInSeconds: 1800,
            })
        })

        it('throws when the refresh token is rejected', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: 'invalid_grant' }),
            })

            await expect(client.refreshTokens('expired-refresh')).rejects.toThrow(OAuthTokenExchangeFailedError)
        })
    })

    describe('revokeSession', () => {
        it('does not throw when the revocation call fails', async () => {
            fetchMock.mockRejectedValue(new Error('network unreachable'))

            await expect(client.revokeSession('refresh-token')).resolves.toBeUndefined()
        })

        it('calls the Keycloak logout endpoint with the refresh token', async () => {
            fetchMock.mockResolvedValue({ ok: true })

            await client.revokeSession('refresh-token')

            expect(fetchMock).toHaveBeenCalledWith(
                `${configuration.issuer}/protocol/openid-connect/logout`,
                expect.objectContaining({ method: 'POST' }),
            )
        })
    })
})
