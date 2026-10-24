import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { validateApiKey, type ApiKeyValidator } from './auth/api-key.js'
import { createServer } from './create-server.js'
import { isRequestOriginAllowed, parseAllowedOrigins } from './request-origin.js'

const port = Number(process.env.PORT ?? 3002)

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
}

/** Stateless mode: a fresh server/transport pair per call keeps concurrent requests isolated. */
async function handleMcpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    allowedOrigins: ReadonlySet<string>,
    validateKey: ApiKeyValidator,
    apiBaseUrl: string,
): Promise<void> {
    if (!isRequestOriginAllowed(req.rawHeaders, allowedOrigins)) {
        sendJson(res, 403, { error: 'origin_not_allowed' })
        return
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, {
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed. This server is stateless and only accepts POST /mcp.',
            },
            id: null,
        })
        return
    }

    const authorization = req.rawHeaders.flatMap((name, index) =>
        index % 2 === 0 && name.toLowerCase() === 'authorization' ? [req.rawHeaders[index + 1]] : [],
    )
    const match = authorization.length === 1 ? /^Bearer (lef_[A-Za-z0-9_-]{43})$/.exec(authorization[0] ?? '') : null
    if (!match) {
        sendJson(res, 401, { error: 'authentication_required' })
        return
    }
    const apiKey = match[1]
    let outcome: Awaited<ReturnType<ApiKeyValidator>>
    try {
        outcome = await validateKey(apiBaseUrl, apiKey)
    } catch {
        outcome = 'unavailable'
    }
    if (outcome !== 'valid') {
        sendJson(res, outcome === 'rejected' ? 401 : 503, {
            error: outcome === 'rejected' ? 'authentication_required' : 'service_unavailable',
        })
        return
    }

    const server = createServer(apiBaseUrl)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
        void transport.close()
        void server.close()
    })
    await server.connect(transport)
    const authenticatedReq = req as IncomingMessage & { auth?: AuthInfo }
    authenticatedReq.auth = { token: apiKey, clientId: 'api-key', scopes: [] }
    await transport.handleRequest(authenticatedReq, res)
}

export interface CreateAppOptions {
    allowedOrigins?: ReadonlySet<string>
    validateKey?: ApiKeyValidator
    apiBaseUrl: string
}

export function createApp(options: CreateAppOptions): Server {
    const allowedOrigins = new Set(options.allowedOrigins ?? [])
    const { apiBaseUrl, validateKey = validateApiKey } = options
    return createHttpServer((req, res) => {
        let url: URL
        try {
            url = new URL(req.url ?? '/', 'http://localhost')
        } catch {
            sendJson(res, 400, { status: 'bad_request' })
            return
        }
        if (req.method === 'GET' && url.pathname === '/health') {
            sendJson(res, 200, { status: 'ok' })
            return
        }
        if (url.pathname === '/mcp') {
            handleMcpRequest(req, res, allowedOrigins, validateKey, apiBaseUrl).catch(() => {
                if (!res.headersSent) {
                    sendJson(res, 500, {
                        jsonrpc: '2.0',
                        error: { code: -32603, message: 'Internal server error' },
                        id: null,
                    })
                }
            })
            return
        }
        sendJson(res, 404, { status: 'not_found' })
    })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    let allowedOrigins: ReadonlySet<string>
    try {
        allowedOrigins = parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS)
    } catch {
        console.error('Invalid MCP_ALLOWED_ORIGINS configuration.')
        process.exit(1)
    }
    const apiBaseUrl = process.env.API_URL
    if (!apiBaseUrl) {
        console.error('API_URL is required.')
        process.exit(1)
    }
    createApp({ allowedOrigins, apiBaseUrl }).listen(port, () => {
        console.log(`mcp-server listening on port ${port}`)
    })
}
