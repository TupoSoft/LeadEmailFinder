import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCheckAsyncVerification } from './tools/check-async-verification.js'
import { registerCheckBatchVerification } from './tools/check-batch-verification.js'
import { registerCheckCreditBalance } from './tools/check-credit-balance.js'
import { registerDownloadBatchResults } from './tools/download-batch-results.js'
import { registerSubmitAsyncVerification } from './tools/submit-async-verification.js'
import { registerSubmitBatchVerification } from './tools/submit-batch-verification.js'

export function createServer(apiBaseUrl: string): McpServer {
    const server = new McpServer({
        name: '@tuposoft/lead-email-finder-mcp-server',
        version: '0.0.0',
    })

    registerCheckCreditBalance(server, apiBaseUrl)
    registerSubmitAsyncVerification(server, apiBaseUrl)
    registerCheckAsyncVerification(server, apiBaseUrl)
    registerSubmitBatchVerification(server, apiBaseUrl)
    registerCheckBatchVerification(server, apiBaseUrl)
    registerDownloadBatchResults(server, apiBaseUrl)

    return server
}
