import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { TokenCache } from '../auth/token-cache.js'
import { createApp } from '../main.js'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

const validAuthorizationHeader = `Basic ${Buffer.from('good-client:good-secret').toString('base64')}`

describe('submit_batch_verification over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let uploadResponse: () => Response | Promise<Response>
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
            if (url.startsWith('https://lef-api.example')) return Promise.resolve(uploadResponse())
            return realFetch(input, init)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callSubmitBatchVerification(emails: string[]): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'submit-batch-verification.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'submit_batch_verification', arguments: { emails } })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('builds a CSV from the submitted addresses and returns the accepted id on 202', async () => {
        uploadResponse = () => jsonResponse(202, { id: 'batch-id' })

        const result = await callSubmitBatchVerification(['person@lef.test', 'other@lef.test'])

        expect(result.isError).toBeFalsy()
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({ id: 'batch-id' })
        const [, init] = fetchMock.mock.calls.find(([input]: [string]) => requestUrl(input).includes('/verifyBatch/csv')) as [string, RequestInit]
        const file = (init.body as FormData).get('file') as File
        expect(await file.text()).toBe('email\nperson@lef.test\nother@lef.test\n')
    })

    it('correctly escapes an address containing a comma or quote character', async () => {
        uploadResponse = () => jsonResponse(202, { id: 'batch-id' })

        await callSubmitBatchVerification(['weird,"person@lef.test'])

        const [, init] = fetchMock.mock.calls.find(([input]: [string]) => requestUrl(input).includes('/verifyBatch/csv')) as [string, RequestInit]
        const file = (init.body as FormData).get('file') as File
        expect(await file.text()).toBe('email\n"weird,""person@lef.test"\n')
    })

    it('rejects an empty address list at the protocol level before ever calling the upstream API', async () => {
        const result = await callSubmitBatchVerification([])

        expect(result.isError).toBe(true)
        expect(fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example'))).toBe(false)
    })

    it('rejects a list exceeding 5000 addresses at the protocol level before ever calling the upstream API', async () => {
        const result = await callSubmitBatchVerification(Array.from({ length: 5001 }, (_, index) => `person${index}@lef.test`))

        expect(result.isError).toBe(true)
        expect(fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example'))).toBe(false)
    })

    it.each([
        [402, 'insufficient_credits'],
        [422, 'validation_failed'],
    ] as const)('maps an upstream HTTP %d into a clean isError result with code %s', async (status, expectedCode) => {
        uploadResponse = () => jsonResponse(status, { message: 'do-not-leak-this-secret-value' })

        const result = await callSubmitBatchVerification(['person@lef.test'])

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe(expectedCode)
        expect(JSON.stringify(body)).not.toContain('do-not-leak-this-secret-value')
    })
})
