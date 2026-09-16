import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function createServer(): McpServer {
    const server = new McpServer({
        name: '@tuposoft/lead-email-finder-mcp-server',
        version: '0.0.0',
    })

    server.registerTool(
        'ping',
        {
            description: 'Smoke-test tool that always returns "pong".',
        },
        () => ({
            content: [{ type: 'text', text: 'pong' }],
        }),
    )

    return server
}
