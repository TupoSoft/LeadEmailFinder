import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/** Distinctive, obviously-fake marker strings -- real credentials never look like this -- so leak
 * scanning has no false-positive risk from ordinary log text. */
const FIXTURE_SECRET_ALPHA = 'fixture-secret-alpha-marker-7f3c1e9b'
const FIXTURE_SECRET_BRAVO = 'fixture-secret-bravo-marker-9d2a44c0'
const BEARER_SENTINEL = 'sentinel-bearer-token-must-never-leak-3f9d21a6'

const fixtureClients: Record<string, { secret: string; balance: number }> = {
    'fixture-client-alpha': { secret: FIXTURE_SECRET_ALPHA, balance: 4217 },
    'fixture-client-bravo': { secret: FIXTURE_SECRET_BRAVO, balance: 1309 },
}

let toolCallCount = 0

/** The fixture tool's own "token" is the fixture client ID (see `fixtureTokenCache` below), so it can
 * look up which fixture client is calling without depending on any real upstream API. */
function buildFixtureServer(): McpServer {
    const server = new McpServer({ name: 'desktop-bridge-fixture', version: '0.0.0' })
    server.registerTool('check_balance', { description: 'Returns a known fixture balance for the calling credential.' }, extra => {
        toolCallCount += 1
        const clientId = extra.authInfo?.token
        const entry = clientId ? fixtureClients[clientId] : undefined
        return { content: [{ type: 'text', text: JSON.stringify({ balance: entry?.balance ?? null }) }] }
    })
    return server
}

jest.mock('./create-server.js', () => {
    const actual = jest.requireActual<typeof import('./create-server.js')>('./create-server.js')
    return { ...actual, createServer: jest.fn(buildFixtureServer) }
})

import type { AccessTokenProvider } from './auth/token-cache.js'
import { createApp } from './main.js'

/** Mirrors the real `TokenCache`'s contract without a real OIDC issuer: rejects with a message
 * containing `BEARER_SENTINEL` on a bad credential, proving (in combination with the leak scan below)
 * that this internal rejection reason never reaches the wire or the proxy's own output -- `main.ts`'s
 * existing catch already replaces it with a generic `401 {"error":"authentication_required"}`. */
const fixtureTokenCache: AccessTokenProvider = {
    getAccessToken: ({ clientId, clientSecret }) => {
        const entry = fixtureClients[clientId]
        if (!entry || entry.secret !== clientSecret) return Promise.reject(new Error(`invalid credentials (${BEARER_SENTINEL})`))
        return Promise.resolve(clientId)
    },
}

const proxyPath = resolve(__dirname, '..', 'node_modules', 'mcp-remote', 'dist', 'proxy.js')

function basicAuthorizationHeader(clientId: string, clientSecret: string): string {
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

interface ProxyClient {
    readonly client: Client
    readonly configDir: string
    stderr: string
    connect(): Promise<void>
    close(): Promise<void>
}

/** Spawns the real, pinned `mcp-remote` proxy exactly as `examples/claude-desktop.local.json` does --
 * same argument shape, same environment-placeholder header -- via the real SDK's `StdioClientTransport`,
 * never a mock. `extraArgs` only ever adds flags absent from the locked template (e.g. a short
 * `--auth-timeout` to bound a deliberately-failing test), never changes the template's own arguments. */
function spawnProxyClient(serverUrl: string, authorizationHeader: string | undefined, extraArgs: readonly string[] = []): ProxyClient {
    const configDir = mkdtempSync(join(tmpdir(), 'mcp-remote-config-'))
    const args = [serverUrl, '--transport', 'http-only', '--allow-http', '--silent', ...extraArgs]
    const env: Record<string, string> = { ...process.env, MCP_REMOTE_CONFIG_DIR: configDir }
    if (authorizationHeader !== undefined) {
        args.push('--header', 'Authorization:${LEF_MCP_AUTHORIZATION}')
        env.LEF_MCP_AUTHORIZATION = authorizationHeader
    }
    const transport = new StdioClientTransport({ command: process.execPath, args: [proxyPath, ...args], env, stderr: 'pipe' })
    const client = new Client({ name: 'desktop-bridge.spec', version: '0.0.0' })
    const proxyClient: ProxyClient = {
        client,
        configDir,
        stderr: '',
        connect: () => client.connect(transport),
        close: async () => {
            await client.close().catch(() => undefined)
            await transport.close().catch(() => undefined)
            rmSync(configDir, { recursive: true, force: true })
        },
    }
    transport.stderr?.on('data', (chunk: Buffer) => {
        proxyClient.stderr += chunk.toString('utf8')
    })
    return proxyClient
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout
    const timeout = new Promise<T>((_resolvePromise, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Recursively collects every file's content beneath `dir` -- the temporary, per-test
 * `MCP_REMOTE_CONFIG_DIR` is always small (a handful of small JSON files at most), so an exhaustive
 * synchronous read is appropriate here, not a performance concern. */
function readAllFileContents(dir: string): string[] {
    const contents: string[] = []
    for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry)
        if (statSync(entryPath).isDirectory()) contents.push(...readAllFileContents(entryPath))
        else contents.push(readFileSync(entryPath, 'utf8'))
    }
    return contents
}

/** Returns a Boolean only -- the plan requires never printing a captured stream or environment on
 * assertion failure, so callers must never pass these haystacks to a matcher that would echo them. */
function containsAnyLeak(haystacks: readonly string[], secrets: readonly string[]): boolean {
    return haystacks.some(haystack => secrets.some(secret => haystack.includes(secret)))
}

describe('Claude Desktop local bridge (real mcp-remote proxy, real SDK client and server)', () => {
    jest.setTimeout(60_000)

    let server: Server
    let port: number
    let serverUrl: string

    beforeAll(async () => {
        server = createApp({ tokenCache: fixtureTokenCache, apiBaseUrl: 'https://unused.example' })
        await new Promise<void>(resolvePromise => server.listen(0, resolvePromise))
        port = (server.address() as AddressInfo).port
        serverUrl = `http://127.0.0.1:${port}/mcp`
    })

    afterAll(async () => {
        await new Promise<void>((resolvePromise, reject) => server.close(error => (error ? reject(error) : resolvePromise())))
    })

    beforeEach(() => {
        toolCallCount = 0
    })

    it(
        'connects, discovers the fixture tool, and reads the known balance for the credential used',
        async () => {
            const proxyClient = spawnProxyClient(serverUrl, basicAuthorizationHeader('fixture-client-alpha', FIXTURE_SECRET_ALPHA))
            try {
                await withTimeout(proxyClient.connect(), 45_000, 'connect')
                const { tools } = await proxyClient.client.listTools()
                expect(tools.map(tool => tool.name)).toContain('check_balance')

                const result = (await proxyClient.client.callTool({ name: 'check_balance', arguments: {} })) as {
                    content: Array<{ type: string; text: string }>
                }
                expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({ balance: 4217 })
                expect(toolCallCount).toBe(1)

                expect(containsAnyLeak([proxyClient.stderr, ...readAllFileContents(proxyClient.configDir)], [FIXTURE_SECRET_ALPHA])).toBe(false)
            } finally {
                await proxyClient.close()
            }
        },
        45_000,
    )

    it(
        'runs two concurrent clients with different credentials, each receiving only its own balance',
        async () => {
            const alpha = spawnProxyClient(serverUrl, basicAuthorizationHeader('fixture-client-alpha', FIXTURE_SECRET_ALPHA))
            const bravo = spawnProxyClient(serverUrl, basicAuthorizationHeader('fixture-client-bravo', FIXTURE_SECRET_BRAVO))
            try {
                await Promise.all([withTimeout(alpha.connect(), 45_000, 'alpha connect'), withTimeout(bravo.connect(), 45_000, 'bravo connect')])

                const [alphaResult, bravoResult] = await Promise.all([
                    alpha.client.callTool({ name: 'check_balance', arguments: {} }) as Promise<{ content: Array<{ type: string; text: string }> }>,
                    bravo.client.callTool({ name: 'check_balance', arguments: {} }) as Promise<{ content: Array<{ type: string; text: string }> }>,
                ])

                expect(JSON.parse(alphaResult.content[0]?.text ?? '')).toEqual({ balance: 4217 })
                expect(JSON.parse(bravoResult.content[0]?.text ?? '')).toEqual({ balance: 1309 })
                expect(toolCallCount).toBe(2)
            } finally {
                await Promise.all([alpha.close(), bravo.close()])
            }
        },
        45_000,
    )

    it(
        'never authenticates or runs the tool with an invalid credential, failing within the bounded auth timeout',
        async () => {
            const proxyClient = spawnProxyClient(
                serverUrl,
                basicAuthorizationHeader('fixture-client-alpha', 'wrong-secret-value'),
                ['--auth-timeout', '3'],
            )
            try {
                await expect(withTimeout(proxyClient.connect(), 40_000, 'connect')).rejects.toBeTruthy()
                expect(toolCallCount).toBe(0)

                expect(
                    containsAnyLeak([proxyClient.stderr, ...readAllFileContents(proxyClient.configDir)], [
                        FIXTURE_SECRET_ALPHA,
                        basicAuthorizationHeader('fixture-client-alpha', FIXTURE_SECRET_ALPHA),
                        BEARER_SENTINEL,
                    ]),
                ).toBe(false)
            } finally {
                await proxyClient.close()
            }
        },
        45_000,
    )

    it(
        'never authenticates or runs the tool without any credential',
        async () => {
            const proxyClient = spawnProxyClient(serverUrl, undefined, ['--auth-timeout', '3'])
            try {
                await expect(withTimeout(proxyClient.connect(), 40_000, 'connect')).rejects.toBeTruthy()
                expect(toolCallCount).toBe(0)

                expect(containsAnyLeak([proxyClient.stderr, ...readAllFileContents(proxyClient.configDir)], [BEARER_SENTINEL])).toBe(false)
            } finally {
                await proxyClient.close()
            }
        },
        45_000,
    )

    it(
        'fails cleanly, with the child process and its listeners cleaned up, when the server is unavailable',
        async () => {
            const unusedPort = await new Promise<number>((resolvePromise, reject) => {
                const probe = createHttpServer()
                probe.listen(0, () => {
                    const { port: probedPort } = probe.address() as AddressInfo
                    probe.close(error => (error ? reject(error) : resolvePromise(probedPort)))
                })
            })

            const proxyClient = spawnProxyClient(
                `http://127.0.0.1:${unusedPort}/mcp`,
                basicAuthorizationHeader('fixture-client-alpha', FIXTURE_SECRET_ALPHA),
                ['--auth-timeout', '3'],
            )
            try {
                await expect(withTimeout(proxyClient.connect(), 40_000, 'connect')).rejects.toBeTruthy()
                expect(toolCallCount).toBe(0)
            } finally {
                await proxyClient.close()
            }
        },
        45_000,
    )

    it('parses the committed configuration template, matches the locked invocation, and contains no secret', () => {
        const templatePath = resolve(__dirname, '..', 'examples', 'claude-desktop.local.json')
        const template = JSON.parse(readFileSync(templatePath, 'utf8')) as {
            mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>
        }

        const entries = Object.values(template.mcpServers)
        expect(entries).toHaveLength(1)
        const [entry] = entries
        expect(entry.command).toBe('<absolute-path-to-node-executable>')
        expect(entry.args).toEqual([
            '<absolute-checkout-path>/apps/mcp-server/node_modules/mcp-remote/dist/proxy.js',
            'http://127.0.0.1:53002/mcp',
            '--transport',
            'http-only',
            '--allow-http',
            '--silent',
            '--header',
            'Authorization:${LEF_MCP_AUTHORIZATION}',
        ])
        expect(entry.env).toEqual({ LEF_MCP_AUTHORIZATION: 'Basic <base64-of-client-id-colon-client-secret>' })

        const raw = readFileSync(templatePath, 'utf8')
        expect(containsAnyLeak([raw], [FIXTURE_SECRET_ALPHA, FIXTURE_SECRET_BRAVO, BEARER_SENTINEL])).toBe(false)
    })
})
