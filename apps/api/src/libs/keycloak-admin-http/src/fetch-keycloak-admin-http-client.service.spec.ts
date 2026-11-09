import { FetchKeycloakAdminHttpClient } from './fetch-keycloak-admin-http-client.service'
import { KeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'

const configuration: KeycloakAdminHttpConfiguration = {
    baseUrl: 'http://localhost:58080',
    realm: 'lead-email-finder',
    clientId: 'lef-org-admin-service',
    clientSecret: 'secret',
}

function jsonResponse(overrides: Partial<Omit<Response, 'body'>> & { jsonBody?: unknown }): Response {
    const { jsonBody, ...rest } = overrides
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(jsonBody === undefined ? '' : JSON.stringify(jsonBody)),
        ...rest,
    } as unknown as Response
}

describe('FetchKeycloakAdminHttpClient', () => {
    let client: FetchKeycloakAdminHttpClient
    let fetchMock: jest.Mock

    beforeEach(() => {
        client = new FetchKeycloakAdminHttpClient(configuration)
        fetchMock = jest.fn()
        global.fetch = fetchMock as never
    })

    function mockTokenResponse(expiresIn = 60): void {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ access_token: 'admin-token', expires_in: expiresIn }),
        })
    }

    it('requests a token then the realm-prefixed URL, with the Bearer and content-type headers and a serialized body', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 201, jsonBody: { id: '1' } }))

        await client.requestRealm('POST', '/users?exact=true', { email: 'a@example.test' }, [201])

        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(tokenUrl).toBe('http://localhost:58080/realms/lead-email-finder/protocol/openid-connect/token')
        expect((tokenInit.body as URLSearchParams).toString()).toBe(
            'grant_type=client_credentials&client_id=lef-org-admin-service&client_secret=secret',
        )

        const [requestUrl, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(requestUrl).toBe('http://localhost:58080/admin/realms/lead-email-finder/users?exact=true')
        expect(requestInit.method).toBe('POST')
        expect(requestInit.headers).toEqual({
            authorization: 'Bearer admin-token',
            'content-type': 'application/json',
        })
        expect(requestInit.body).toBe('{"email":"a@example.test"}')
    })

    it('sends no content-type header or body for a bodyless request', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, jsonBody: { id: '1' } }))

        await client.requestRealm('GET', '/users/1')

        const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(requestInit.headers).toEqual({ authorization: 'Bearer admin-token' })
        expect(requestInit.body).toBeUndefined()
    })

    it('fetches a client-credentials token before the first call and reuses it on the next call', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, jsonBody: { id: '1' } }))
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, jsonBody: { id: '1' } }))

        await client.requestRealm('GET', '/users/1')
        await client.requestRealm('GET', '/users/1')

        const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
            (call[0] as string).includes('/protocol/openid-connect/token'),
        )
        expect(tokenCalls).toHaveLength(1)
    })

    it('refreshes the token once it is close to expiry', async () => {
        mockTokenResponse(0)
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 204 }))
        mockTokenResponse(60)
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 204 }))

        await client.requestRealm('POST', '/users', {}, [204])
        await client.requestRealm('POST', '/users', {}, [204])

        const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
            (call[0] as string).includes('/protocol/openid-connect/token'),
        )
        expect(tokenCalls).toHaveLength(2)
    })

    it('defaults the token TTL when expires_in is absent', async () => {
        fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'admin-token' }) })
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 204 }))
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 204 }))

        await client.requestRealm('POST', '/users', {}, [204])
        await client.requestRealm('POST', '/users', {}, [204])

        const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
            (call[0] as string).includes('/protocol/openid-connect/token'),
        )
        expect(tokenCalls).toHaveLength(1)
    })

    it('throws when the authentication request fails', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })

        await expect(client.requestRealm('GET', '/users/1')).rejects.toThrow('authentication failed')
    })

    it('throws with the response body when the status is not accepted', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce({ ok: false, status: 409, text: () => Promise.resolve('conflict') })

        await expect(client.requestRealm('POST', '/users', {}, [201])).rejects.toThrow('409')
    })

    it('returns undefined for a 204 response', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 204 }))

        await expect(client.requestRealm('DELETE', '/users/1', undefined, [204])).resolves.toBeUndefined()
    })

    it('returns undefined for an empty body regardless of status', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200 }))

        await expect(client.requestRealm('GET', '/users/1')).resolves.toBeUndefined()
    })

    it('returns undefined for an explicitly accepted 404 with a text body, without parsing it', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404,
            headers: { get: () => null },
            text: () => Promise.resolve('not found'),
        })

        await expect(client.requestRealm('DELETE', '/clients/missing', undefined, [204, 404])).resolves.toBeUndefined()
    })

    it('parses a JSON body on success', async () => {
        mockTokenResponse()
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, jsonBody: { id: '1' } }))

        await expect(client.requestRealm('GET', '/users/1')).resolves.toEqual({ id: '1' })
    })
})
