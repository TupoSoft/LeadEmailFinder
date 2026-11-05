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
import { createServer as createHttpServer } from 'node:http'

const mockedCreateServer = createServer as jest.MockedFunction<typeof createServer>
const keyA = `lef_${'a'.repeat(43)}`
const keyB = `lef_${'b'.repeat(43)}`

async function listen(server: Server): Promise<number> {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    return (server.address() as AddressInfo).port
}
async function close(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
}

describe('MCP API-key authentication through real HTTP and SDK transport', () => {
    let server: Server
    let upstream: Server
    let port: number
    let status: number
    let validations: string[]
    beforeAll(async () => {
        upstream = createHttpServer((req, res) => {
            validations.push(req.headers.authorization ?? '')
            expect(req.url).toBe('/v1/auth/api-key')
            const accepted = [keyA, keyB].some(key => req.headers.authorization === `Bearer ${key}`)
            res.writeHead(accepted ? status : 401)
            res.end(status === 204 ? undefined : 'private upstream details')
        })
        const upstreamPort = await listen(upstream)
        server = createApp({ apiBaseUrl: `http://127.0.0.1:${upstreamPort}` })
        port = await listen(server)
    })
    beforeEach(() => {
        status = 204
        validations = []
        mockedCreateServer.mockClear()
    })
    afterAll(async () => {
        await close(server)
        await close(upstream)
    })

    async function rawPost(
        authorization?: string | string[],
        method = 'tools/list',
    ): Promise<{ status: number; body: string }> {
        return new Promise((resolve, reject) => {
            const req = httpRequest(
                {
                    host: '127.0.0.1',
                    port,
                    path: '/mcp',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/event-stream',
                        ...(authorization ? { Authorization: authorization } : {}),
                    },
                },
                res => {
                    const chunks: Buffer[] = []
                    res.on('data', chunk => chunks.push(chunk))
                    res.on('end', () =>
                        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
                    )
                },
            )
            req.on('error', reject)
            req.end(JSON.stringify({ jsonrpc: '2.0', method, id: 1 }))
        })
    }
    async function echo(key: string): Promise<string> {
        const client = new Client({ name: 'api-key-test', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${key}` } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'echo-token', arguments: {} })
            return (result.content as Array<{ text: string }>)[0].text
        } finally {
            await client.close()
        }
    }

    it('validates initialize, notifications, list, and tool calls separately without caching', async () => {
        expect(await echo(keyA)).toBe(keyA)
        const firstCount = validations.length
        expect(firstCount).toBeGreaterThanOrEqual(3)
        expect(await echo(keyA)).toBe(keyA)
        expect(validations.length).toBeGreaterThan(firstCount)
        expect(validations.every(value => value === `Bearer ${keyA}`)).toBe(true)
    })
    it('keeps concurrent caller keys isolated', async () => {
        expect(await Promise.all([echo(keyA), echo(keyB)])).toEqual([keyA, keyB])
    })
    it.each([
        undefined,
        'Basic old-secret',
        'Bearer header.payload.signature',
        `Bearer ${keyA},${keyB}`,
        [`Bearer ${keyA}`, `Bearer ${keyB}`],
    ])('rejects malformed, missing, and duplicate credentials before validation and dispatch', async authorization => {
        expect((await rawPost(authorization)).status).toBe(401)
        expect(validations).toHaveLength(0)
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })
    it.each(['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])(
        'rejects revoked keys before dispatching %s',
        async method => {
            await echo(keyA)
            mockedCreateServer.mockClear()
            status = 401
            const response = await rawPost(`Bearer ${keyA}`, method)
            expect(response).toEqual({ status: 401, body: JSON.stringify({ error: 'authentication_required' }) })
            expect(mockedCreateServer).not.toHaveBeenCalled()
        },
    )
    it.each([403, 500, 200])('maps validation status %s to a safe rejection without dispatch', async upstreamStatus => {
        status = upstreamStatus
        const response = await rawPost(`Bearer ${keyA}`)
        expect(response.status).toBe(upstreamStatus === 403 ? 401 : 503)
        expect(response.body).not.toContain('private upstream details')
        expect(response.body).not.toContain(keyA)
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })
})
