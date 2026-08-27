import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OidcClientCredentialsTokenProvider, readM2mCredentialsFile } from './m2m-token-provider'

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

describe('readM2mCredentialsFile', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'proxy-fleet-swarm-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('reads and validates a well-formed credentials file', async () => {
        const path = join(dir, 'credentials.json')
        await writeFile(path, JSON.stringify({ issuer: 'https://issuer', clientId: 'id', clientSecret: 'secret' }))

        await expect(readM2mCredentialsFile(path)).resolves.toEqual({
            issuer: 'https://issuer',
            clientId: 'id',
            clientSecret: 'secret',
        })
    })

    it('rejects a file missing required fields', async () => {
        const path = join(dir, 'credentials.json')
        await writeFile(path, JSON.stringify({ issuer: 'https://issuer' }))

        await expect(readM2mCredentialsFile(path)).rejects.toThrow(/must contain/)
    })
})

describe('OidcClientCredentialsTokenProvider', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    const credentials = { issuer: 'https://issuer', clientId: 'id', clientSecret: 'secret' }

    it('exchanges credentials for a bearer token', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        const provider = new OidcClientCredentialsTokenProvider(credentials)

        await expect(provider.getToken()).resolves.toBe('token-1')
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://issuer/protocol/openid-connect/token')
        expect((init.body as URLSearchParams).toString()).toContain('grant_type=client_credentials')
    })

    it('caches the token until shortly before it expires', async () => {
        let now = 0
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 300 }))

        const provider = new OidcClientCredentialsTokenProvider(credentials, 30, () => now)

        await expect(provider.getToken()).resolves.toBe('token-1')
        now = 100_000
        await expect(provider.getToken()).resolves.toBe('token-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('requests a new token once the cached one is near expiry', async () => {
        let now = 0
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-1', expires_in: 60 }))
            .mockResolvedValueOnce(jsonResponse(200, { access_token: 'token-2', expires_in: 60 }))

        const provider = new OidcClientCredentialsTokenProvider(credentials, 30, () => now)

        await expect(provider.getToken()).resolves.toBe('token-1')
        now = 31_000
        await expect(provider.getToken()).resolves.toBe('token-2')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('throws when the grant fails', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_client' }))

        await expect(new OidcClientCredentialsTokenProvider(credentials).getToken()).rejects.toThrow(
            /HTTP 401: invalid_client/,
        )
    })
})
