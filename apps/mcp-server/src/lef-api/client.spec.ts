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

const operation = {
    id: 'op-id',
    source: 'fresh' as const,
    observedAt: '2026-09-21T00:00:00.000Z',
    cacheExpiresAt: '2026-09-22T00:00:00.000Z',
    billing: { state: 'settled' as const, reserved: 1 as const, charged: 1 as const, reason: 'conclusive' as const },
}

const emailResult = {
    id: 'result-id',
    email: 'person@lef.test',
    localPart: 'person',
    domain: 'lef.test',
    exists: true,
    catchAll: null,
    reason: 'accepted_email',
    sources: ['mx'],
}

describe('LefApiClient.verifySync', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it('sends the bearer token and email, returning a completed result on 201', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(201, { ...emailResult, operation }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.verifySync('person@lef.test')).resolves.toEqual({ kind: 'completed', result: { ...emailResult, operation } })
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.example/verify')
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body as string)).toEqual({ email: 'person@lef.test' })
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-access-token')
    })

    it('returns an accepted pointer, not an error, when the API falls back to async on 202', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(202, { id: 'async-id' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.verifySync('slow@lef.test')).resolves.toEqual({ kind: 'accepted', id: 'async-id' })
    })

    it.each([
        [402, 'insufficient_credits'],
        [429, 'rate_limited'],
    ] as const)('rejects with the mapped code on HTTP %d -> %s', async (status, expectedCode) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, { message: 'insufficient_credits' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.verifySync('person@lef.test')).rejects.toMatchObject({ code: expectedCode })
    })
})

describe('LefApiClient.submitAsyncVerification', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it('sends the bearer token and email, returning the accepted id on 202', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(202, { id: 'async-id' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.submitAsyncVerification('person@lef.test')).resolves.toEqual({ id: 'async-id' })
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.example/verifyAsync')
        expect(JSON.parse(init.body as string)).toEqual({ email: 'person@lef.test' })
    })

    it('rejects with the mapped code on a failed submission', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(402, { message: 'insufficient_credits' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.submitAsyncVerification('person@lef.test')).rejects.toMatchObject({ code: 'insufficient_credits' })
    })
})

describe('LefApiClient.getAsyncVerificationStatus', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it.each([
        [{ state: 'queued' }],
        [{ state: 'running' }],
        [{ state: 'completed', result: emailResult, operation }],
        [{ state: 'failed', failureCode: 'verification_failed', operation }],
        [{ state: 'unavailable' }],
    ])('passes the %o state through faithfully', async state => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, state))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getAsyncVerificationStatus('op-id')).resolves.toEqual(state)
        const [url] = fetchMock.mock.calls[0] as [string]
        expect(url).toBe('https://api.example/verifyAsync/op-id')
    })

    it('rejects with not_found for a missing or foreign operation', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'not found' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getAsyncVerificationStatus('missing-id')).rejects.toMatchObject({ code: 'not_found' })
    })
})

describe('LefApiClient.getVerificationResult', () => {
    let fetchMock: jest.Mock

    beforeEach(() => {
        fetchMock = jest.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it('returns the result for an owned id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, emailResult))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getVerificationResult('result-id')).resolves.toEqual(emailResult)
        const [url] = fetchMock.mock.calls[0] as [string]
        expect(url).toBe('https://api.example/verifications/result-id')
    })

    it('rejects with not_found for a missing or foreign result id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'Verification result not found' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getVerificationResult('foreign-id')).rejects.toMatchObject({ code: 'not_found' })
    })

    it('rejects with validation_failed for a malformed id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: 'invalid uuid' }))
        const client = new LefApiClient('https://api.example', () => Promise.resolve('the-access-token'))

        await expect(client.getVerificationResult('not-a-uuid')).rejects.toMatchObject({ code: 'validation_failed' })
    })
})
