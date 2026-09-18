import { ClientCredentialsGrantError, TokenCache } from './token-cache.js'

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

describe('TokenCache', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    const credentials = { clientId: 'client-a', clientSecret: 'super-secret-value' }

    it('exchanges credentials for a bearer token', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://issuer/protocol/openid-connect/token')
        expect((init.body as URLSearchParams).toString()).toContain('grant_type=client_credentials')
        expect((init.body as URLSearchParams).toString()).toContain('client_secret=super-secret-value')
    })

    it('reuses the cached token on a second call for the same client and avoids a second fetch', async () => {
        let now = 0
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        const cache = new TokenCache('https://issuer', 30, () => now)

        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        now = 100_000
        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('mints a new token once the cached one is near expiry', async () => {
        let now = 0
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 60 }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-2', expires_in: 60 }))

        const cache = new TokenCache('https://issuer', 30, () => now)

        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        now = 31_000
        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-2')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('never shares a cached token between two different client IDs', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-a', expires_in: 300 }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-b', expires_in: 300 }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: 'secret-a' })).resolves.toBe('token-a')
        await expect(cache.getAccessToken({ clientId: 'client-b', clientSecret: 'secret-b' })).resolves.toBe('token-b')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('throws a typed error on a failed grant without leaking the secret', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))

        const cache = new TokenCache('https://issuer')

        let thrown: unknown
        try {
            await cache.getAccessToken(credentials)
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(ClientCredentialsGrantError)
        expect((thrown as ClientCredentialsGrantError).status).toBe(401)
        expect((thrown as ClientCredentialsGrantError).code).toBe('invalid_client')
        expect((thrown as Error).message).not.toContain(credentials.clientSecret)
    })

    it('never caches a token after a failed grant', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken(credentials)).rejects.toThrow(ClientCredentialsGrantError)
        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
