import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './create-server.js'

const port = Number(process.env.PORT ?? 3002)

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
}

/** Stateless mode: a fresh server/transport pair per call keeps concurrent requests isolated. */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
        sendJson(res, 405, {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed. This server is stateless and only accepts POST /mcp.' },
            id: null,
        })
        return
    }
    const server = createServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
        void transport.close()
        void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
}

export function createApp(): Server {
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
            handleMcpRequest(req, res).catch(() => {
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
    createApp().listen(port, () => {
        console.log(`mcp-server listening on port ${port}`)
    })
}
