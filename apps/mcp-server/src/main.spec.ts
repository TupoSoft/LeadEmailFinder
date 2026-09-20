import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

/** These suites are about routing and the auth gate, not any particular tool's behavior, so they
 * substitute a trivial always-succeeding tool for the real one rather than depending on
 * check_credit_balance's own upstream API. */
function buildProbeServer(): McpServer {
    const server = new McpServer({ name: 'main-spec-test-server', version: '0.0.0' })
    server.registerTool('probe', { description: 'Always succeeds.' }, () => ({ content: [{ type: 'text', text: 'ok' }] }))
    return server
}

jest.mock('./create-server.js', () => {
    const actual = jest.requireActual<typeof import('./create-server.js')>('./create-server.js')
    return { ...actual, createServer: jest.fn(buildProbeServer) }
})

import { TokenCache, type AccessTokenProvider } from './auth/token-cache.js'
import { createServer } from './create-server.js'
import { createApp } from './main.js'

const mockedCreateServer = createServer as jest.MockedFunction<typeof createServer>
const fakeTokenCache: AccessTokenProvider = { getAccessToken: () => Promise.resolve('fake-access-token') }
const validAuthorizationHeader = `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`

describe('mcp-server request routing', () => {
    let server: Server
    let baseUrl: URL

    beforeAll(async () => {
        server = createApp({ tokenCache: fakeTokenCache, apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        const { port } = server.address() as AddressInfo
        baseUrl = new URL(`http://127.0.0.1:${port}/`)
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    afterEach(() => {
        mockedCreateServer.mockClear()
    })

    it('returns 404 for an unknown path', async () => {
        const response = await fetch(new URL('nope', baseUrl))

        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ status: 'not_found' })
    })

    it('returns 405 for GET /mcp', async () => {
        const response = await fetch(new URL('mcp', baseUrl))

        expect(response.status).toBe(405)
        const body = (await response.json()) as { error: { code: number } }
        expect(body.error.code).toBe(-32000)
    })

    it('returns 405 for DELETE /mcp', async () => {
        const response = await fetch(new URL('mcp', baseUrl), { method: 'DELETE' })

        expect(response.status).toBe(405)
        const body = (await response.json()) as { error: { code: number } }
        expect(body.error.code).toBe(-32000)
    })

    it('maps an MCP handler rejection to HTTP 500 before headers are sent', async () => {
        mockedCreateServer.mockImplementationOnce(
            () =>
                ({
                    connect: () => Promise.reject(new Error('boom')),
                    close: () => Promise.resolve(),
                }) as unknown as ReturnType<typeof createServer>,
        )

        const response = await fetch(new URL('mcp', baseUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                Authorization: validAuthorizationHeader,
            },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
        })

        expect(response.status).toBe(500)
        const body = (await response.json()) as { error: { code: number } }
        expect(body.error.code).toBe(-32603)
    })
})

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response
}

function requestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
}

interface RawPostResult {
    status: number
    body: string
}

/** Uses `node:http` directly (not the global `fetch`) so mocking `global.fetch` for the token
 * endpoint below never intercepts this test's own request to the server under test. */
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

describe('mcp-server authentication gate', () => {
    let server: Server
    let port: number
    let fetchMock: jest.Mock
    let grantResponse: Response
    const realFetch = global.fetch

    beforeAll(async () => {
        server = createApp({ tokenCache: new TokenCache('https://issuer'), apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    // The MCP SDK client transport also uses the global fetch to reach this test's own server, so the
    // mock must forward anything that isn't the token endpoint to the real implementation and be
    // restored afterward -- otherwise it leaks into every later describe block in this file.
    beforeEach(() => {
        fetchMock = jest.fn((input: string | URL | Request, init?: RequestInit) => {
            return requestUrl(input).startsWith('https://issuer') ? Promise.resolve(grantResponse) : realFetch(input, init)
        })
        global.fetch = fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    function countGrantCalls(): number {
        return fetchMock.mock.calls.filter(([input]) => requestUrl(input as string | URL | Request).startsWith('https://issuer')).length
    }

    it('rejects a request with no Authorization header, without ever calling the token endpoint', async () => {
        const response = await rawPost(port, {})

        expect(response.status).toBe(401)
        expect(JSON.parse(response.body)).toEqual({ error: 'authentication_required' })
        expect(countGrantCalls()).toBe(0)
    })

    it('rejects a malformed Authorization header with the same generic body, without calling the token endpoint', async () => {
        const response = await rawPost(port, { Authorization: 'Bearer not-basic-auth' })

        expect(response.status).toBe(401)
        expect(JSON.parse(response.body)).toEqual({ error: 'authentication_required' })
        expect(countGrantCalls()).toBe(0)
    })

    it('mints exactly one token for two requests in quick succession with the same credential', async () => {
        grantResponse = jsonResponse(200, { access_token: 'token-1', expires_in: 300 })
        const authorization = `Basic ${Buffer.from('cached-client:cached-secret').toString('base64')}`

        const [first, second] = await Promise.all([rawPost(port, { Authorization: authorization }), rawPost(port, { Authorization: authorization })])

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(countGrantCalls()).toBe(1)
    })

    it('cleanly rejects a credential that fails the grant, without leaking the secret anywhere observable', async () => {
        const secret = 'super-secret-value-must-not-leak'
        grantResponse = jsonResponse(401, { error: 'invalid_client' })
        const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const authorization = `Basic ${Buffer.from(`bad-client:${secret}`).toString('base64')}`

        const response = await rawPost(port, { Authorization: authorization })

        expect(response.status).toBe(401)
        expect(JSON.parse(response.body)).toEqual({ error: 'authentication_required' })
        expect(response.body).not.toContain(secret)
        for (const call of logSpy.mock.calls) expect(call.join(' ')).not.toContain(secret)
        logSpy.mockRestore()
    })

    it('succeeds end to end with a valid credential and a successful grant', async () => {
        grantResponse = jsonResponse(200, { access_token: 'token-1', expires_in: 300 })
        const authorization = `Basic ${Buffer.from('good-client:good-secret').toString('base64')}`

        const client = new Client({ name: 'main.spec-auth', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: authorization } },
        })
        await client.connect(transport)
        try {
            const result = await client.callTool({ name: 'probe', arguments: {} })
            expect(result.content).toEqual([{ type: 'text', text: 'ok' }])
        } finally {
            await client.close()
        }
    })
})

/** Builds a fresh, isolated copy of the package under a temporary directory so this regression
 * never depends on stale or absent `dist` output, and never shares state with other test runs. */
function buildIsolatedServer(): { tempDir: string; bootstrapPath: string } {
    const packageRoot = resolve(__dirname, '..')
    const tscBin = resolve(packageRoot, '..', '..', 'node_modules', '.bin', 'tsc')
    const tempDir = mkdtempSync(join(tmpdir(), 'mcp-crash-regression-'))

    execFileSync(tscBin, ['-p', join(packageRoot, 'tsconfig.json'), '--outDir', join(tempDir, 'dist')], { timeout: 30_000 })
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }))
    symlinkSync(join(packageRoot, 'node_modules'), join(tempDir, 'node_modules'), 'dir')

    const bootstrapPath = join(tempDir, 'bootstrap.mjs')
    writeFileSync(
        bootstrapPath,
        [
            "import { createApp } from './dist/main.js'",
            '',
            "const server = createApp({ tokenCache: { getAccessToken: () => Promise.resolve('fake-access-token') }, apiBaseUrl: 'http://127.0.0.1:1' })",
            "server.listen(0, '127.0.0.1', () => {",
            '    const address = server.address()',
            "    if (!address || typeof address === 'string') throw new Error('expected a network address')",
            "    if (typeof process.send !== 'function') throw new Error('bootstrap must run under IPC')",
            '    process.send({ port: address.port })',
            '})',
            '',
        ].join('\n'),
    )
    return { tempDir, bootstrapPath }
}

interface RawResponse {
    status: number
    contentType: string | undefined
    body: string
}

function decodeChunkedBody(raw: string): string {
    let offset = 0
    let result = ''
    for (;;) {
        const lineEnd = raw.indexOf('\r\n', offset)
        if (lineEnd === -1) break
        const size = parseInt(raw.slice(offset, lineEnd).trim(), 16)
        if (!Number.isFinite(size) || size === 0) break
        const dataStart = lineEnd + 2
        result += raw.slice(dataStart, dataStart + size)
        offset = dataStart + size + 2
    }
    return result
}

/** Writes a literal request line over a raw socket, bypassing any client-side URL normalization. */
function sendRawRequest(port: number, target: string): Promise<RawResponse> {
    return new Promise((resolvePromise, reject) => {
        const socket = connect(port, '127.0.0.1', () => {
            socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`)
        })
        const chunks: Buffer[] = []
        socket.setTimeout(5_000, () => {
            socket.destroy()
            reject(new Error('raw request timed out'))
        })
        socket.on('data', chunk => chunks.push(chunk))
        socket.on('error', reject)
        socket.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            const [head, ...rest] = raw.split('\r\n\r\n')
            const headLines = (head ?? '').split('\r\n')
            const status = Number(headLines[0]?.split(' ')[1])
            const contentType = headLines
                .find(line => line.toLowerCase().startsWith('content-type:'))
                ?.split(':')[1]
                ?.trim()
            resolvePromise({ status, contentType, body: decodeChunkedBody(rest.join('\r\n\r\n')) })
        })
    })
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise(resolvePromise => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolvePromise()
            return
        }
        const timer = setTimeout(() => {
            child.kill('SIGKILL')
        }, timeoutMs)
        child.once('exit', () => {
            clearTimeout(timer)
            resolvePromise()
        })
        child.kill()
    })
}

describe('process regression: malformed request targets do not crash the server', () => {
    jest.setTimeout(60_000)

    let tempDir: string
    let child: ChildProcess
    let port: number
    let pid: number

    beforeAll(async () => {
        const built = buildIsolatedServer()
        tempDir = built.tempDir
        child = fork(built.bootstrapPath, [], { cwd: tempDir, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
        pid = child.pid as number

        port = await new Promise<number>((resolvePromise, reject) => {
            const timer = setTimeout(() => reject(new Error('server did not report a port within 5000ms')), 5_000)
            child.once('message', message => {
                clearTimeout(timer)
                resolvePromise((message as { port: number }).port)
            })
            child.once('exit', code => {
                clearTimeout(timer)
                reject(new Error(`child exited early with code ${code}`))
            })
        })
    }, 40_000)

    afterAll(async () => {
        await waitForChildExit(child, 5_000)
        rmSync(tempDir, { recursive: true, force: true })
    })

    async function assertProcessSurvives(): Promise<void> {
        expect(child.exitCode).toBeNull()
        expect(child.pid).toBe(pid)

        const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5_000) })
        expect(health.status).toBe(200)
        expect(await health.json()).toEqual({ status: 'ok' })

        const client = new Client({ name: 'main.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)
        try {
            // No real LEF API is reachable from this isolated process; check_credit_balance's network
            // failure against http://127.0.0.1:1 (connection refused, no DNS lookup) is itself the proof
            // that the same process still resolves auth and dispatches a real tool call cleanly.
            const result = await client.callTool({ name: 'check_credit_balance', arguments: {} })
            expect(result.isError).toBe(true)
            const content = result.content as Array<{ type: string; text: string }>
            expect(JSON.parse(content[0]?.text ?? '')).toMatchObject({ code: 'unexpected_upstream_error' })
        } finally {
            await client.close()
        }
    }

    it.each([['//'], ['http://[']])(
        'rejects the malformed request target %s with HTTP 400 and keeps the process answering',
        async target => {
            const response = await sendRawRequest(port, target)

            expect(response.status).toBe(400)
            expect(response.contentType).toContain('application/json')
            expect(JSON.parse(response.body)).toEqual({ status: 'bad_request' })

            await assertProcessSurvives()
        },
    )
})
