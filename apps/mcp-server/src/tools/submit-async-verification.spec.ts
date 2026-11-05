import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApp } from '../main.js'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

const validAuthorizationHeader = `Bearer lef_${'a'.repeat(43)}`

describe('submit_async_verification over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let submitResponse: () => Response | Promise<Response>
    const realFetch = global.fetch

    beforeAll(async () => {
        server = createApp({ validateKey: () => Promise.resolve('valid'), apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) =>
            server.close(error => (error ? reject(error) : resolvePromise())),
        )
    })

    beforeEach(() => {
        fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = requestUrl(input)
            if (url.startsWith('https://lef-api.example')) return Promise.resolve(submitResponse())
            return realFetch(input, init)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callSubmitAsyncVerification(
        email: string,
    ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'submit-async-verification.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'submit_async_verification', arguments: { email } })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('sends the submitted address and returns the accepted id on 202', async () => {
        submitResponse = () => jsonResponse(202, { id: 'async-id' })

        const result = await callSubmitAsyncVerification('person@lef.test')

        expect(result.isError).toBeFalsy()
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({ id: 'async-id' })
        const [, init] = fetchMock.mock.calls.find(([input]: [string]) =>
            requestUrl(input).includes('/verifyAsync'),
        ) as [string, RequestInit]
        expect(JSON.parse(init.body as string)).toEqual({ email: 'person@lef.test' })
    })

    it('rejects a malformed email at the protocol level before ever calling the upstream API', async () => {
        const result = await callSubmitAsyncVerification('not-an-email')

        expect(result.isError).toBe(true)
        expect(
            fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example')),
        ).toBe(false)
    })

    it.each([
        [402, 'insufficient_credits'],
        [429, 'rate_limited'],
    ] as const)('maps an upstream HTTP %d into a clean isError result with code %s', async (status, expectedCode) => {
        submitResponse = () => jsonResponse(status, { message: 'do-not-leak-this-secret-value' })

        const result = await callSubmitAsyncVerification('person@lef.test')

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe(expectedCode)
        expect(JSON.stringify(body)).not.toContain('do-not-leak-this-secret-value')
    })
})
