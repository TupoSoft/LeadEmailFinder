import { LefApiClient, UpstreamRequestError } from './client.js'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

describe('LefApiClient.getBillingSummary', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it('sends the bearer token and returns the parsed balance on success', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { balance: 100, reserved: 10, available: 90 }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getBillingSummary()).resolves.toEqual({ balance: 100, reserved: 10, available: 90 })
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.example/v1/billing/summary')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-access-token')
    })

    it.each([
        [400, 'validation_failed'],
        [401, 'authentication_required'],
        [402, 'insufficient_credits'],
        [403, 'permission_denied'],
        [404, 'not_found'],
        [422, 'validation_failed'],
        [429, 'rate_limited'],
        [503, 'service_unavailable'],
        [500, 'unexpected_upstream_error'],
    ] as const)('rejects with the mapped code on HTTP %d -> %s, making exactly one request', async (status, expectedCode) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { message: 'do-not-leak-this-secret-value' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        let thrown: unknown
        try {
            await client.getBillingSummary()
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(UpstreamRequestError)
        expect((thrown as UpstreamRequestError).code).toBe(expectedCode)
        expect((thrown as Error).message).not.toContain('do-not-leak-this-secret-value')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('surfaces retryAfterSeconds from a 429 response', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(429, { message: 'rate limited' }, { 'Retry-After': '15' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getBillingSummary()).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 15 })
    })

    it('rejects with unexpected_upstream_error on a network-level throw', async () => {
        fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getBillingSummary()).rejects.toMatchObject({ code: 'unexpected_upstream_error' })
    })
})
