import { HttpProxyRegistryAdmin, OWNED_DESCRIPTION_PREFIX, ownedDescriptionFor, PROXY_PROTOCOL_HTTP } from './proxy-registry-admin'

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
    } as Response
}

describe('ownedDescriptionFor', () => {
    it('prefixes the egressId with the owned description prefix', () => {
        expect(ownedDescriptionFor('egress-a')).toBe(`${OWNED_DESCRIPTION_PREFIX}egress-a`)
    })
})

describe('HttpProxyRegistryAdmin', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    function admin(): HttpProxyRegistryAdmin {
        return new HttpProxyRegistryAdmin({ baseUrl: 'https://api.example', getBearerToken: () => Promise.resolve('token-123') })
    }

    it('lists owned proxies across pages, filtering out manually created records', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse(200, {
                    proxies: [
                        { id: '1', protocol: 1, host: 'h', port: 1, state: 'active', weight: 1, maxConcurrent: 1, requestsPerMinute: 1, description: 'proxy-fleet:egress-a' },
                        { id: '2', protocol: 1, host: 'h', port: 2, state: 'active', weight: 1, maxConcurrent: 1, requestsPerMinute: 1, description: 'manually added' },
                    ],
                    nextPageToken: '1',
                }),
            )
            .mockResolvedValueOnce(
                jsonResponse(200, {
                    proxies: [
                        { id: '3', protocol: 1, host: 'h', port: 3, state: 'disabled', weight: 1, maxConcurrent: 1, requestsPerMinute: 1, description: 'proxy-fleet:egress-b' },
                    ],
                    nextPageToken: '',
                }),
            )

        const owned = await admin().listOwnedProxies()

        expect(owned.map(record => record.id)).toEqual(['1', '3'])
        expect(fetchMock).toHaveBeenCalledTimes(2)
        const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(secondUrl).toContain('pageToken=1')
    })

    it('sends the bearer token and no body for GET requests', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { proxies: [], nextPageToken: '' }))

        await admin().listOwnedProxies()

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(init.headers).toMatchObject({ authorization: 'Bearer token-123' })
        expect(init.body).toBeUndefined()
    })

    it('creates a proxy disabled with the owned description, never returning credentials from the caller', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(201, {
                id: 'new-id',
                protocol: PROXY_PROTOCOL_HTTP,
                host: '172.29.10.2',
                port: 13001,
                state: 'disabled',
                weight: 1,
                maxConcurrent: 20,
                requestsPerMinute: 300,
                description: 'proxy-fleet:egress-a',
            }),
        )

        const created = await admin().createDisabled({
            egressId: 'egress-a',
            protocol: PROXY_PROTOCOL_HTTP,
            host: '172.29.10.2',
            port: 13001,
            auth: { user: 'egress-a', pass: 'secret' },
            weight: 1,
            maxConcurrent: 20,
            requestsPerMinute: 300,
        })

        expect(created.state).toBe('disabled')
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        const body = JSON.parse(init.body as string) as Record<string, unknown>
        expect(body).toMatchObject({ state: 'disabled', description: 'proxy-fleet:egress-a' })
    })

    it('updates only the given fields', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))

        await admin().update('id-1', { weight: 5 })

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.example/v1/proxies/id-1')
        expect(init.method).toBe('PATCH')
        expect(JSON.parse(init.body as string)).toEqual({ weight: 5 })
    })

    it('transitions state via a PATCH with only the state field', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))

        await admin().transitionState('id-1', 'draining')

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(JSON.parse(init.body as string)).toEqual({ state: 'draining' })
    })

    it('throws with the response body when a request fails', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 402, text: () => Promise.resolve('insufficient credits') })

        await expect(admin().transitionState('id-1', 'active')).rejects.toThrow(/HTTP 402: insufficient credits/)
    })
})
