import { ConfigService } from '@nestjs/config'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { createBffSessionConfiguration } from '../config/bff-session-configuration'
import { KeycloakOAuthClient, OAuthTokenExchangeFailedError } from './keycloak-oauth-client'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'http://localhost:58080/realms/lead-email-finder',
    backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
    jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
    clientId: 'lef-web-bff',
    clientSecret: 'bff-secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

describe('KeycloakOAuthClient', () => {
    let client: KeycloakOAuthClient
    let fetchMock: jest.Mock<Promise<Partial<Response>>, [string, RequestInit]>
    const originalFetch = global.fetch

    beforeEach(() => {
        client = new KeycloakOAuthClient(configuration)
        fetchMock = jest.fn()
        global.fetch = fetchMock as never
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('uses normalized public endpoints for every request when the back-channel override is absent', async () => {
        const fallback = createBffSessionConfiguration(
            new ConfigService({
                APP_BASE_URL: configuration.appBaseUrl,
                OIDC_ISSUER_URL: `${configuration.issuer}///`,
                BFF_CLIENT_ID: configuration.clientId,
                BFF_CLIENT_SECRET: configuration.clientSecret,
            }),
        )
        client = new KeycloakOAuthClient(fallback)
        fetchMock.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id_token: 'id', access_token: 'access', refresh_token: 'refresh' }),
        })

        const authorizationUrl = new URL(client.buildAuthorizationUrl({
            redirectUri: `${configuration.appBaseUrl}/v1/auth/callback`,
            state: 'state',
            nonce: 'nonce',
            codeChallenge: 'challenge',
        }))
        await client.exchangeAuthorizationCode({ code: 'code', redirectUri: 'callback', codeVerifier: 'verifier' })
        await client.refreshTokens('refresh')
        await client.revokeSession('refresh')

        expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(`${configuration.issuer}/protocol/openid-connect/auth`)
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            `${configuration.issuer}/protocol/openid-connect/token`,
            `${configuration.issuer}/protocol/openid-connect/token`,
            `${configuration.issuer}/protocol/openid-connect/logout`,
        ])
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
            expect(fetchMock).toHaveBeenCalledWith(
                `${configuration.backchannelUrl}/protocol/openid-connect/token`,
                expect.objectContaining({ method: 'POST' }),
            )
            const body = fetchMock.mock.calls[0][1].body as URLSearchParams
            expect(Object.fromEntries(body)).toEqual({
                client_id: configuration.clientId,
                client_secret: configuration.clientSecret,
                grant_type: 'authorization_code',
                code: 'auth-code',
                redirect_uri: 'http://localhost:53000/v1/auth/callback',
                code_verifier: 'verifier',
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
            expect(fetchMock).toHaveBeenCalledWith(
                `${configuration.backchannelUrl}/protocol/openid-connect/token`,
                expect.objectContaining({ method: 'POST' }),
            )
            const body = fetchMock.mock.calls[0][1].body as URLSearchParams
            expect(body.get('grant_type')).toBe('refresh_token')
            expect(body.get('refresh_token')).toBe('old-refresh')
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
                `${configuration.backchannelUrl}/protocol/openid-connect/logout`,
                expect.objectContaining({ method: 'POST' }),
            )
            const body = fetchMock.mock.calls[0][1].body as URLSearchParams
            expect(body.get('refresh_token')).toBe('refresh-token')
        })
    })
})
