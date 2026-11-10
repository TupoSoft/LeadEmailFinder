import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApp } from '../main.js'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function csvResponse(csv: string): Response {
    return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } })
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

const validAuthorizationHeader = `Bearer lef_${'a'.repeat(43)}`
const batchId = '11111111-1111-4111-8111-111111111111'

function statusWith(resultsAvailable: boolean): unknown {
    return {
        id: batchId,
        status: resultsAvailable ? 'completed' : 'running',
        progress: resultsAvailable ? 100 : 50,
        total: 3,
        processed: resultsAvailable ? 3 : 1,
        unprocessed: resultsAvailable ? 0 : 2,
        resultsAvailable,
        counts: {
            totalRows: 3,
            uniqueAddresses: 3,
            duplicateRows: 0,
            cachedAddresses: 0,
            sharedAddresses: 0,
            cooldownAddresses: 0,
            completedAddresses: resultsAvailable ? 3 : 1,
            conclusiveAddresses: 0,
            inconclusiveAddresses: resultsAvailable ? 3 : 1,
            failedAddresses: 0,
        },
        billing: { state: resultsAvailable ? 'settled' : 'pending', reserved: 3, charged: 0 },
    }
}

const sampleCsv = 'id,email\nr1,one@lef.test\nr2,two@lef.test\nr3,three@lef.test\n'

describe('download_batch_results over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let resultsAvailable: boolean
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
        resultsAvailable = true
        fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = requestUrl(input)
            if (url.endsWith('/results')) return Promise.resolve(csvResponse(sampleCsv))
            if (url.startsWith('https://lef-api.example'))
                return Promise.resolve(jsonResponse(200, statusWith(resultsAvailable)))
            return realFetch(input, init)
        })
        global.fetch = fetchMock
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    async function callDownloadBatchResults(
        args: Record<string, unknown>,
    ): Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }> {
        const client = new Client({ name: 'download-batch-results.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'download_batch_results', arguments: args })
            return result as { isError?: boolean; content: Array<{ type: string; text: string }> }
        } finally {
            await client.close()
        }
    }

    it('returns parsed rows with default pagination metadata for a completed batch', async () => {
        const result = await callDownloadBatchResults({ id: batchId })

        expect(result.isError).toBeFalsy()
        const body = JSON.parse(result.content[0]?.text ?? '') as {
            rows: unknown[]
            totalRows: number
            truncated: boolean
            nextOffset: number | null
        }
        expect(body.rows).toEqual([
            { id: 'r1', email: 'one@lef.test' },
            { id: 'r2', email: 'two@lef.test' },
            { id: 'r3', email: 'three@lef.test' },
        ])
        expect(body).toMatchObject({ totalRows: 3, truncated: false, nextOffset: null })
    })

    it('slices rows for the requested offset/limit window and reports the next offset', async () => {
        const result = await callDownloadBatchResults({ id: batchId, offset: 1, limit: 1 })

        expect(result.isError).toBeFalsy()
        const body = JSON.parse(result.content[0]?.text ?? '') as {
            rows: unknown[]
            totalRows: number
            truncated: boolean
            nextOffset: number | null
        }
        expect(body.rows).toEqual([{ id: 'r2', email: 'two@lef.test' }])
        expect(body).toMatchObject({ totalRows: 3, truncated: true, nextOffset: 2 })
    })

    it('silently caps a limit above 1000 rather than rejecting it', async () => {
        const result = await callDownloadBatchResults({ id: batchId, limit: 5000 })

        expect(result.isError).toBeFalsy()
        const body = JSON.parse(result.content[0]?.text ?? '') as { rows: unknown[] }
        expect(body.rows).toHaveLength(3)
    })

    it('returns a clear, specific message instead of a parse error when results are not yet available', async () => {
        resultsAvailable = false

        const result = await callDownloadBatchResults({ id: batchId })

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toMatch(/not available yet/i)
        expect(fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).endsWith('/results'))).toBe(false)
    })

    it('rejects a malformed id at the protocol level before ever calling the upstream API', async () => {
        const result = await callDownloadBatchResults({ id: 'not-a-uuid' })

        expect(result.isError).toBe(true)
        expect(
            fetchMock.mock.calls.some(([input]: [string]) => requestUrl(input).startsWith('https://lef-api.example')),
        ).toBe(false)
    })

    it('maps a missing or foreign batch to a clean not_found result', async () => {
        fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = requestUrl(input)
            if (url.startsWith('https://lef-api.example'))
                return Promise.resolve(jsonResponse(404, { message: 'not found' }))
            return realFetch(input, init)
        })
        global.fetch = fetchMock

        const result = await callDownloadBatchResults({ id: batchId })

        expect(result.isError).toBe(true)
        const body = JSON.parse(result.content[0]?.text ?? '') as { code: string }
        expect(body.code).toBe('not_found')
    })
})
