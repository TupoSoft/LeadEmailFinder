import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { parseBasicCredentials } from './auth/basic-credentials.js'
import { TokenCache, type AccessTokenProvider } from './auth/token-cache.js'
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
    tokenCache: AccessTokenProvider,
    apiBaseUrl: string,
): Promise<void> {
    if (!isRequestOriginAllowed(req.rawHeaders, allowedOrigins)) {
        sendJson(res, 403, { error: 'origin_not_allowed' })
        return
    }
    if (req.method !== 'POST') {
        sendJson(res, 405, {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed. This server is stateless and only accepts POST /mcp.' },
            id: null,
        })
        return
    }

    const parsedCredentials = parseBasicCredentials(req.headers.authorization)
    if (!parsedCredentials.ok) {
        sendJson(res, 401, { error: 'authentication_required' })
        return
    }
    let accessToken: string
    try {
        accessToken = await tokenCache.getAccessToken(parsedCredentials.credentials)
    } catch {
        sendJson(res, 401, { error: 'authentication_required' })
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
    authenticatedReq.auth = { token: accessToken, clientId: parsedCredentials.credentials.clientId, scopes: [] }
    await transport.handleRequest(authenticatedReq, res)
}

export interface CreateAppOptions {
    allowedOrigins?: ReadonlySet<string>
    tokenCache: AccessTokenProvider
    apiBaseUrl: string
}

export function createApp(options: CreateAppOptions): Server {
    const allowedOrigins = new Set(options.allowedOrigins ?? [])
    const { tokenCache, apiBaseUrl } = options
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
            handleMcpRequest(req, res, allowedOrigins, tokenCache, apiBaseUrl).catch(() => {
                if (!res.headersSent) {
                    sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
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
    const tokenEndpointBaseUrl = process.env.OIDC_BACKCHANNEL_URL
    if (!tokenEndpointBaseUrl) {
        console.error('OIDC_BACKCHANNEL_URL is required.')
        process.exit(1)
    }
    const apiBaseUrl = process.env.API_URL
    if (!apiBaseUrl) {
        console.error('API_URL is required.')
        process.exit(1)
    }
    const tokenCache = new TokenCache(tokenEndpointBaseUrl)
    createApp({ allowedOrigins, tokenCache, apiBaseUrl }).listen(port, () => {
        console.log(`mcp-server listening on port ${port}`)
    })
}
