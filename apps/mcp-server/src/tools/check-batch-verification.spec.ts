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
const batchId = '11111111-1111-4111-8111-111111111111'

const batchStatus = {
    id: batchId,
    status: 'completed',
    progress: 100,
    total: 2,
    processed: 2,
    unprocessed: 0,
    resultsAvailable: true,
    counts: {
        totalRows: 2,
        uniqueAddresses: 2,
        duplicateRows: 0,
        cachedAddresses: 0,
        sharedAddresses: 0,
        cooldownAddresses: 0,
        completedAddresses: 2,
        conclusiveAddresses: 0,
        inconclusiveAddresses: 2,
        failedAddresses: 0,
    },
    billing: { state: 'settled', reserved: 2, charged: 0 },
}

describe('check_batch_verification over real HTTP and the real SDK transport', () => {
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
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callCheckBatchVerification(
        id: string,
    ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'check-batch-verification.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'check_batch_verification', arguments: { id } })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('returns the full status object for an owned batch', async () => {
        statusResponse = () => jsonResponse(200, batchStatus)

        const result = await callCheckBatchVerification(batchId)

        expect(result.isError).toBeFalsy()
        expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(batchStatus)
        const [url] = fetchMock.mock.calls.find(([input]: [string]) =>
            requestUrl(input).startsWith('https://lef-api.example'),
        ) as [string]
        expect(url).toBe(`https://lef-api.example/verifyBatch/${batchId}`)
    })

    it('rejects a malformed id at the protocol level before ever calling the upstream API', async () => {
        const result = await callCheckBatchVerification('not-a-uuid')

        expect(result.isError).toBe(true)
        expect(
            fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example')),
        ).toBe(false)
    })

    it('maps a missing or foreign batch to a clean not_found result', async () => {
        statusResponse = () => jsonResponse(404, { message: 'Batch with id "..." not found.' })

        const result = await callCheckBatchVerification(batchId)

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe('not_found')
    })
})
