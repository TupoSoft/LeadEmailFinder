import { ClientCredentialsGrantError, TokenCache } from './token-cache.js'

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => {
        resolve = r
    })
    return { promise, resolve }
}

describe('TokenCache', () => {
    let fetchMock: jest.Mock
    const realFetch = global.fetch

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        jest.clearAllMocks()
        global.fetch = realFetch
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

    it('rejects an incorrect secret for a client ID that has already authenticated successfully', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))
            .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: 'right-secret' })).resolves.toBe('token-1')
        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: 'wrong-secret' })).rejects.toThrow(ClientCredentialsGrantError)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // The still-valid entry for the correct secret must remain usable after the sibling rejection.
        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: 'right-secret' })).resolves.toBe('token-1')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('rejects an empty secret for a client ID that has already authenticated successfully', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))
            .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: 'right-secret' })).resolves.toBe('token-1')
        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: '' })).rejects.toThrow(ClientCredentialsGrantError)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('digests differently for credential pairs whose plain concatenation would collide', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-ab-c', expires_in: 300 }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-a-bc', expires_in: 300 }))

        const cache = new TokenCache('https://issuer')

        await expect(cache.getAccessToken({ clientId: 'ab', clientSecret: 'c' })).resolves.toBe('token-ab-c')
        await expect(cache.getAccessToken({ clientId: 'a', clientSecret: 'bc' })).resolves.toBe('token-a-bc')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not reuse an expired token when renewal fails, and permits a later retry to succeed', async () => {
        let now = 0
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 60 }))
            .mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-2', expires_in: 60 }))

        const cache = new TokenCache('https://issuer', 30, () => now)

        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-1')
        now = 31_000
        await expect(cache.getAccessToken(credentials)).rejects.toThrow(ClientCredentialsGrantError)
        await expect(cache.getAccessToken(credentials)).resolves.toBe('token-2')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('shares exactly one pending grant between concurrent calls with identical credentials', async () => {
        const grant = deferred<Response>()
        fetchMock.mockReturnValueOnce(grant.promise)

        const cache = new TokenCache('https://issuer')
        const callA = cache.getAccessToken(credentials)
        const callB = cache.getAccessToken(credentials)
        grant.resolve(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        await expect(callA).resolves.toBe('token-1')
        await expect(callB).resolves.toBe('token-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('never shares a pending grant between different secrets for the same client ID', async () => {
        const validGrant = deferred<Response>()
        const invalidGrant = deferred<Response>()
        fetchMock.mockReturnValueOnce(validGrant.promise).mockReturnValueOnce(invalidGrant.promise)

        const cache = new TokenCache('https://issuer')
        const validCall = cache.getAccessToken({ clientId: 'client-a', clientSecret: 'right-secret' })
        const invalidCall = cache.getAccessToken({ clientId: 'client-a', clientSecret: 'wrong-secret' })
        validGrant.resolve(jsonResponse(200, { access_token: 'token-valid', expires_in: 300 }))
        invalidGrant.resolve(jsonResponse(401, { error: 'invalid_client' }))

        await expect(validCall).resolves.toBe('token-valid')
        await expect(invalidCall).rejects.toThrow(ClientCredentialsGrantError)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('gives each concurrent valid client only its own bearer token', async () => {
        const grantA = deferred<Response>()
        const grantB = deferred<Response>()
        fetchMock.mockReturnValueOnce(grantA.promise).mockReturnValueOnce(grantB.promise)

        const cache = new TokenCache('https://issuer')
        const callA = cache.getAccessToken({ clientId: 'client-a', clientSecret: 'secret-a' })
        const callB = cache.getAccessToken({ clientId: 'client-b', clientSecret: 'secret-b' })
        grantB.resolve(jsonResponse(200, { access_token: 'token-b', expires_in: 300 }))
        grantA.resolve(jsonResponse(200, { access_token: 'token-a', expires_in: 300 }))

        await expect(callA).resolves.toBe('token-a')
        await expect(callB).resolves.toBe('token-b')
    })

    it('never exposes the secret or the token through a captured log line', async () => {
        const secret = 'must-never-appear-in-any-log'
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))
        const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        const cache = new TokenCache('https://issuer')
        await expect(cache.getAccessToken({ clientId: 'client-a', clientSecret: secret })).rejects.toThrow(ClientCredentialsGrantError)

        for (const call of logSpy.mock.calls) expect(call.join(' ')).not.toContain(secret)
        logSpy.mockRestore()
    })
})
