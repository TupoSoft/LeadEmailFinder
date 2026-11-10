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
const operationId = '11111111-1111-4111-8111-111111111111'

describe('check_async_verification over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let statusResponse: () => Response | Promise<Response>
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
            if (url.startsWith('https://lef-api.example')) return Promise.resolve(statusResponse())
            return realFetch(input, init)
        })
        global.fetch = fetchMock
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callCheckAsyncVerification(
        id: string,
    ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'check-async-verification.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'check_async_verification', arguments: { id } })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it.each([
        { state: 'queued' },
        { state: 'running' },
        {
            state: 'completed',
            result: {
                id: 'result-id',
                email: 'person@lef.test',
                localPart: 'person',
                domain: 'lef.test',
                exists: true,
                catchAll: null,
                reason: 'accepted_email',
                sources: ['mx'],
            },
            operation: {
                id: 'op-id',
                source: 'fresh',
                observedAt: '2026-09-21T00:00:00.000Z',
                cacheExpiresAt: '2026-09-22T00:00:00.000Z',
                billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
            },
        },
        {
            state: 'failed',
            failureCode: 'verification_failed',
            operation: {
                id: 'op-id',
                source: 'fresh',
                observedAt: null,
                cacheExpiresAt: null,
                billing: { state: 'settled', reserved: 1, charged: 0, reason: 'inconclusive' },
            },
        },
        { state: 'unavailable' },
    ])('passes the $state state through faithfully', async state => {
        statusResponse = () => jsonResponse(200, state)

        const result = await callCheckAsyncVerification(operationId)

        expect(result.isError).toBeFalsy()
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(state)
        const [url] = fetchMock.mock.calls.find(([input]: [string]) =>
            requestUrl(input).startsWith('https://lef-api.example'),
        ) as [string]
        expect(url).toBe(`https://lef-api.example/v1/email-verifications/${operationId}`)
    })

    it('rejects a malformed id at the protocol level before ever calling the upstream API', async () => {
        const result = await callCheckAsyncVerification('not-a-uuid')

        expect(result.isError).toBe(true)
        expect(
            fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example')),
        ).toBe(false)
    })

    it('maps a missing or foreign operation to a clean not_found result', async () => {
        statusResponse = () => jsonResponse(404, { message: 'Job with id "..." not found.' })

        const result = await callCheckAsyncVerification(operationId)

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe('not_found')
    })
})
