import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

jest.mock('./create-server.js', () => {
    const actual = jest.requireActual<typeof import('./create-server.js')>('./create-server.js')
    return { ...actual, createServer: jest.fn(actual.createServer) }
})

import { createServer } from './create-server.js'
import { createApp } from './main.js'

const mockedCreateServer = createServer as jest.MockedFunction<typeof createServer>

function rawPost(port: number, headers: Record<string, string | string[]>): Promise<{ status: number; body: string }> {
    return new Promise((resolvePromise, reject) => {
        const body = JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1, params: {} })
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

describe('request origin integration (HTTP boundary)', () => {
    let server: Server
    let port: number

    beforeAll(async () => {
        server = createApp({ allowedOrigins: new Set(['https://client.example']) })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    afterEach(() => {
        mockedCreateServer.mockClear()
    })

    async function callPingViaSdk(origin?: string): Promise<unknown> {
        const client = new Client({ name: 'request-origin.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(
            new URL(`http://127.0.0.1:${port}/mcp`),
            origin === undefined ? undefined : { requestInit: { headers: { Origin: origin } } },
        )
        await client.connect(transport)
        try {
            return await client.callTool({ name: 'ping', arguments: {} })
        } finally {
            await client.close()
        }
    }

    it('accepts a request with no Origin header', async () => {
        const result = await callPingViaSdk()

        expect(result).toMatchObject({ content: [{ type: 'text', text: 'pong' }] })
        expect(mockedCreateServer).toHaveBeenCalled()
    })

    it('accepts a request whose Origin header is on the allowlist', async () => {
        const result = await callPingViaSdk('https://client.example')

        expect(result).toMatchObject({ content: [{ type: 'text', text: 'pong' }] })
        expect(mockedCreateServer).toHaveBeenCalled()
    })

    it('rejects a request whose Origin header is not on the allowlist before it reaches the tool factory', async () => {
        await expect(callPingViaSdk('https://untrusted.example')).rejects.toThrow()

        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('rejects a mismatched port before it reaches the tool factory', async () => {
        await expect(callPingViaSdk('https://client.example:8443')).rejects.toThrow()

        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('rejects an empty Origin header value with the exact generic body', async () => {
        const response = await rawPost(port, { Origin: '' })

        expect(response.status).toBe(403)
        expect(JSON.parse(response.body)).toEqual({ error: 'origin_not_allowed' })
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('rejects duplicate Origin headers even when every value is allowed', async () => {
        const response = await rawPost(port, { Origin: ['https://client.example', 'https://client.example'] })

        expect(response.status).toBe(403)
        expect(JSON.parse(response.body)).toEqual({ error: 'origin_not_allowed' })
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('rejects the opaque origin null', async () => {
        const response = await rawPost(port, { Origin: 'null' })

        expect(response.status).toBe(403)
        expect(JSON.parse(response.body)).toEqual({ error: 'origin_not_allowed' })
    })

    it('cannot be tricked into trusting an untrusted origin via Host or a forwarded header', async () => {
        const response = await rawPost(port, {
            Origin: 'https://untrusted.example',
            Host: 'client.example',
            'X-Forwarded-Host': 'client.example',
        })

        expect(response.status).toBe(403)
        expect(mockedCreateServer).not.toHaveBeenCalled()
    })

    it('runs an allowed and a denied request concurrently without either affecting the other', async () => {
        const [allowed, denied] = await Promise.allSettled([callPingViaSdk('https://client.example'), callPingViaSdk('https://untrusted.example')])

        expect(allowed.status).toBe('fulfilled')
        expect(denied.status).toBe('rejected')
    })

    it('keeps health and allowed calls working after a rejection', async () => {
        await expect(callPingViaSdk('https://untrusted.example')).rejects.toThrow()

        const health = await fetch(`http://127.0.0.1:${port}/health`)
        expect(health.status).toBe(200)

        const result = await callPingViaSdk('https://client.example')
        expect(result).toMatchObject({ content: [{ type: 'text', text: 'pong' }] })
    })
})

/** Builds a fresh copy of the package's own executable into a temporary directory, so this test
 * exercises the real startup path (`main.ts`'s own env parsing and exit-before-listen behavior)
 * rather than a mock, without depending on stale or absent `dist` output. */
function buildIsolatedExecutable(): { tempDir: string; mainPath: string } {
    const packageRoot = resolve(__dirname, '..')
    const tscBin = resolve(packageRoot, '..', '..', 'node_modules', '.bin', 'tsc')
    const tempDir = mkdtempSync(join(tmpdir(), 'mcp-origin-config-'))

    execFileSync(tscBin, ['-p', join(packageRoot, 'tsconfig.json'), '--outDir', join(tempDir, 'dist')], { timeout: 30_000 })
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }))
    symlinkSync(join(packageRoot, 'node_modules'), join(tempDir, 'node_modules'), 'dir')

    return { tempDir, mainPath: join(tempDir, 'dist', 'main.js') }
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise(resolvePromise => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolvePromise()
            return
        }
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
        child.once('exit', () => {
            clearTimeout(timer)
            resolvePromise()
        })
        child.kill()
    })
}

function collectUntilMatch(child: ChildProcess, stream: 'stdout' | 'stderr', pattern: RegExp, timeoutMs: number): Promise<string> {
    return new Promise((resolvePromise, reject) => {
        let collected = ''
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${String(pattern)} on ${stream}: ${collected}`)), timeoutMs)
        const onData = (chunk: Buffer): void => {
            collected += chunk.toString('utf8')
            if (pattern.test(collected)) {
                clearTimeout(timer)
                resolvePromise(collected)
            }
        }
        child[stream]?.on('data', onData)
        child.once('exit', () => {
            clearTimeout(timer)
            resolvePromise(collected)
        })
    })
}

describe('process regression: MCP_ALLOWED_ORIGINS startup validation', () => {
    jest.setTimeout(60_000)

    it(
        'starts successfully with a valid MCP_ALLOWED_ORIGINS value',
        async () => {
            const { tempDir, mainPath } = buildIsolatedExecutable()
            let child: ChildProcess | undefined
            try {
                child = fork(mainPath, [], {
                    cwd: tempDir,
                    env: { ...process.env, MCP_ALLOWED_ORIGINS: 'https://client.example', PORT: '0' },
                    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                })
                const stdout = await collectUntilMatch(child, 'stdout', /listening on port/, 5_000)

                expect(stdout).toMatch(/listening on port/)
                expect(child.exitCode).toBeNull()
            } finally {
                if (child) await waitForChildExit(child, 5_000)
                rmSync(tempDir, { recursive: true, force: true })
            }
        },
        40_000,
    )

    it(
        'refuses to start and never binds a listener with an invalid MCP_ALLOWED_ORIGINS value',
        async () => {
            const { tempDir, mainPath } = buildIsolatedExecutable()
            let child: ChildProcess | undefined
            try {
                child = fork(mainPath, [], {
                    cwd: tempDir,
                    env: { ...process.env, MCP_ALLOWED_ORIGINS: 'https://this-invalid-value-must-not-be-echoed.example/some/path', PORT: '0' },
                    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                })
                const stderr = await collectUntilMatch(child, 'stderr', /MCP_ALLOWED_ORIGINS/, 5_000)
                await waitForChildExit(child, 5_000)

                expect(child.exitCode).not.toBe(0)
                expect(stderr).toContain('MCP_ALLOWED_ORIGINS')
                expect(stderr).not.toContain('this-invalid-value-must-not-be-echoed')
                expect(stderr).not.toMatch(/listening on port/)
            } finally {
                if (child) await waitForChildExit(child, 5_000)
                rmSync(tempDir, { recursive: true, force: true })
            }
        },
        40_000,
    )
})
