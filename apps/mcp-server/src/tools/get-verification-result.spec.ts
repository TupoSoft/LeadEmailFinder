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
const resultId = '11111111-1111-4111-8111-111111111111'

const result = {
    id: resultId,
    email: 'person@lef.test',
    localPart: 'person',
    domain: 'lef.test',
    exists: true,
    catchAll: null,
    reason: 'accepted_email',
    sources: ['mx'],
}

describe('get_verification_result over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let lookupResponse: () => Response | Promise<Response>
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
            if (url.startsWith('https://lef-api.example')) return Promise.resolve(lookupResponse())
            return realFetch(input, init)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callGetVerificationResult(
        id: string,
    ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'get-verification-result.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const callResult = await client.callTool({ name: 'get_verification_result', arguments: { id } })
            return callResult as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('returns the result for an owned id', async () => {
        lookupResponse = () => jsonResponse(200, result)

        const callResult = await callGetVerificationResult(resultId)

        expect(callResult.isError).toBeFalsy()
        expect(JSON.parse(callResult.content[0]?.text ?? '')).toEqual(result)
        const [url] = fetchMock.mock.calls.find(([input]: [string]) =>
            requestUrl(input).startsWith('https://lef-api.example'),
        ) as [string]
        expect(url).toBe(`https://lef-api.example/verifications/${resultId}`)
    })

    it('rejects a malformed id at the protocol level before ever calling the upstream API', async () => {
        const callResult = await callGetVerificationResult('not-a-uuid')

        expect(callResult.isError).toBe(true)
        expect(
            fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example')),
        ).toBe(false)
    })

    it('never returns another organization data: a foreign or missing id maps to a clean not_found result', async () => {
        lookupResponse = () => jsonResponse(404, { message: 'Verification result not found' })

        const callResult = await callGetVerificationResult(resultId)

        expect(callResult.isError).toBe(true)
        const body = JSON.parse(callResult.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe('not_found')
    })
})
