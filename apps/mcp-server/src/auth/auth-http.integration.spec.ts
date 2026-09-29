import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

/** A tiny stand-in server exposing only the bearer token this request authenticated with, so tests can
 * prove that concurrent requests never observe another request's token -- `ping` carries no such signal. */
function buildEchoTokenServer(): McpServer {
    const server = new McpServer({ name: 'auth-http-integration-test-server', version: '0.0.0' })
    server.registerTool('echo-token', { description: 'Returns the bearer token attached to this request.' }, extra => ({
        content: [{ type: 'text', text: extra.authInfo?.token ?? 'none' }],
    }))
    return server
}

jest.mock('../create-server.js', () => {
    const actual = jest.requireActual<typeof import('../create-server.js')>('../create-server.js')
    return { ...actual, createServer: jest.fn(buildEchoTokenServer) }
})

import { createServer } from '../create-server.js'
import { createApp } from '../main.js'
import { TokenCache } from './token-cache.js'

const mockedCreateServer = createServer as jest.MockedFunction<typeof createServer>

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => {
        resolve = r
    })
    return { promise, resolve }
}

interface RawPostResult {
    status: number
    body: string
}

/** Uses `node:http` directly (not the global `fetch`) so mocking `global.fetch` for the token endpoint
 * below never intercepts this test's own request to the server under test. */
function rawPost(port: number, headers: Record<string, string>): Promise<RawPostResult> {
    return new Promise((resolvePromise, reject) => {
        const body = JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
        const req = httpRequest(
            {
                host: '127.0.0.1',
                port,
                path: '/mcp',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
                timeout: 5_000,
            },
            res => {
                const chunks: Buffer[] = []
                res.on('data', chunk => chunks.push(chunk))
                res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
            },
        )
        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('raw request timed out'))
        })
        req.end(body)
    })
}

function basicAuth(clientId: string, clientSecret: string): string {
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

describe('MCP authentication over real HTTP and the real SDK transport', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    const realFetch = global.fetch
    /** Maps `"clientId:clientSecret"` to a canned grant outcome; unlisted pairs are rejected. */
    const grantOutcomes = new Map<string, { status: number; body: unknown }>([
        ['client-a:right-secret-a', { status: 200, body: { access_token: 'token-for-client-a', expires_in: 300 } }],
        ['client-b:right-secret-b', { status: 200, body: { access_token: 'token-for-client-b', expires_in: 300 } }],
    ])
    /** Optional per-credential delay so a test can hold a grant pending while it fires other requests. */
    const grantDelays = new Map<string, Deferred<void>>()

    beforeAll(async () => {
        server = createApp({ tokenCache: new TokenCache('https://issuer'), apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    beforeEach(() => {
        fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
            if (!requestUrl(input).startsWith('https://issuer')) return realFetch(input, init)

            const params = new URLSearchParams((init?.body as URLSearchParams | undefined)?.toString())
            const key = `${params.get('client_id')}:${params.get('client_secret')}`
            const delay = grantDelays.get(key)
            if (delay) await delay.promise

            const outcome = grantOutcomes.get(key) ?? { status: 401, body: { error: 'invalid_client' } }
            return jsonResponse(outcome.status, outcome.body)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
        grantDelays.clear()
        mockedCreateServer.mockClear()
    })

    async function callEchoTokenViaSdk(clientId: string, clientSecret: string): Promise<string> {
        const client = new Client({ name: 'auth-http.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: basicAuth(clientId, clientSecret) } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'echo-token', arguments: {} })
            const content = result.content as Array<{ type: string; text: string }>
            return content[0]?.text ?? ''
        } finally {
            await client.close()
        }
    }

    it('authenticates with a valid credential and dispatches to the tool', async () => {
        const token = await callEchoTokenViaSdk('client-a', 'right-secret-a')

        expect(token).toBe('token-for-client-a')
        expect(mockedCreateServer).toHaveBeenCalled()
    })

    it('rejects an incorrect secret for an already-authenticated client ID without dispatching to any tool', async () => {
        await callEchoTokenViaSdk('client-a', 'right-secret-a')
        mockedCreateServer.mockClear()

        const response = await rawPost(port, { Authorization: basicAuth('client-a', 'wrong-secret') })

        expect(response.status).toBe(401)
        expect(JSON.parse(response.body)).toEqual({ error: 'authentication_required' })
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('rejects an empty secret for an already-authenticated client ID without dispatching to any tool', async () => {
        await callEchoTokenViaSdk('client-a', 'right-secret-a')
        mockedCreateServer.mockClear()

        const response = await rawPost(port, { Authorization: basicAuth('client-a', '') })

        expect(response.status).toBe(401)
        expect(JSON.parse(response.body)).toEqual({ error: 'authentication_required' })
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('reuses the cached grant for a repeated valid credential, minting no extra token', async () => {
        function countGrantCalls(): number {
            return fetchMock.mock.calls.filter(([input]) => requestUrl(input as string | URL | Request).startsWith('https://issuer')).length
        }

        await callEchoTokenViaSdk('client-a', 'right-secret-a')
        const grantCallsAfterFirst = countGrantCalls()

        await callEchoTokenViaSdk('client-a', 'right-secret-a')

        expect(countGrantCalls()).toBe(grantCallsAfterFirst)
    })

    it('rejects an incorrect secret sent while the valid grant for the same client ID is still pending', async () => {
        const holdValidGrant = deferred<void>()
        grantDelays.set('client-a:right-secret-a', holdValidGrant)

        const validCall = callEchoTokenViaSdk('client-a', 'right-secret-a')
        const invalidResponse = await rawPost(port, { Authorization: basicAuth('client-a', 'wrong-secret') })

        expect(invalidResponse.status).toBe(401)
        expect(JSON.parse(invalidResponse.body)).toEqual({ error: 'authentication_required' })

        holdValidGrant.resolve()
        await expect(validCall).resolves.toBe('token-for-client-a')
    })

    it('gives each concurrent valid client only its own bearer token', async () => {
        const [tokenA, tokenB] = await Promise.all([
            callEchoTokenViaSdk('client-a', 'right-secret-a'),
            callEchoTokenViaSdk('client-b', 'right-secret-b'),
        ])

        expect(tokenA).toBe('token-for-client-a')
        expect(tokenB).toBe('token-for-client-b')
    })
})
