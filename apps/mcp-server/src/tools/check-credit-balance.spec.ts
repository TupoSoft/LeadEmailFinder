import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { TokenCache } from '../auth/token-cache.js'
import { createApp } from '../main.js'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

const validAuthorizationHeader = `Basic ${Buffer.from('good-client:good-secret').toString('base64')}`

describe('check_credit_balance over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let billingResponse: () => Response | Promise<Response>
    const realFetch = global.fetch

    beforeAll(async () => {
        server = createApp({ tokenCache: new TokenCache('https://issuer'), apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    beforeEach(() => {
        fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = requestUrl(input)
            if (url.startsWith('https://issuer')) return Promise.resolve(jsonResponse(200, { access_token: 'a-token', expires_in: 300 }))
            if (url.startsWith('https://lef-api.example')) return Promise.resolve(billingResponse())
            return realFetch(input, init)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callCheckCreditBalance(): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'check-credit-balance.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'check_credit_balance', arguments: {} })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('returns the real balance shape on success', async () => {
        billingResponse = () => jsonResponse(200, { balance: 1000, reserved: 40, available: 960 })

        const result = await callCheckCreditBalance()

        expect(result.isError).toBeFalsy()
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({ balance: 1000, reserved: 40, available: 960 })
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
    ] as const)('maps an upstream HTTP %d into a clean isError result with code %s', async (status, expectedCode) => {
        billingResponse = () => jsonResponse(status, { message: 'do-not-leak-this-secret-value' })

        const result = await callCheckCreditBalance()

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe(expectedCode)
        expect(JSON.stringify(body)).not.toContain('do-not-leak-this-secret-value')
    })

    it('surfaces a permission_denied failure as isError with only code and the fixed message', async () => {
        billingResponse = () => jsonResponse(403, { message: 'do-not-leak-this-secret-value' })

        const result = await callCheckCreditBalance()

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '')
        expect(body).toEqual({ code: 'permission_denied', message: 'The credential lacks the required permission.' })
    })

    it('surfaces retryAfterSeconds from a 429 upstream response', async () => {
        billingResponse = () => jsonResponse(429, { message: 'slow down' }, { 'Retry-After': '20' })

        const result = await callCheckCreditBalance()

        const body = JSON.parse(result.content[0]?.text ?? '')
        expect(body).toEqual({ code: 'rate_limited', message: expect.any(String), retryAfterSeconds: 20 })
    })

    it('maps a network-level failure to a clean isError result', async () => {
        billingResponse = () => {
            throw new Error('connect ECONNREFUSED')
        }

        const result = await callCheckCreditBalance()

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe('unexpected_upstream_error')
    })
})
