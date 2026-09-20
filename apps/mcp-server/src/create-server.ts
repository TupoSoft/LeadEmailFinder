import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCheckCreditBalance } from './tools/check-credit-balance.js'

export function createServer(apiBaseUrl: string): McpServer {
    const server = new McpServer({
        name: '@tuposoft/lead-email-finder-mcp-server',
        version: '0.0.0',
    })

    registerCheckCreditBalance(server, apiBaseUrl)

    return server
}
