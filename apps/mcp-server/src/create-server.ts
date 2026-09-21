import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCheckAsyncVerification } from './tools/check-async-verification.js'
import { registerCheckCreditBalance } from './tools/check-credit-balance.js'
import { registerGetVerificationResult } from './tools/get-verification-result.js'
import { registerSubmitAsyncVerification } from './tools/submit-async-verification.js'
import { registerVerifyEmail } from './tools/verify-email.js'

export function createServer(apiBaseUrl: string): McpServer {
    const server = new McpServer({
        name: '@tuposoft/lead-email-finder-mcp-server',
        version: '0.0.0',
    })

    registerCheckCreditBalance(server, apiBaseUrl)
    registerVerifyEmail(server, apiBaseUrl)
    registerSubmitAsyncVerification(server, apiBaseUrl)
    registerCheckAsyncVerification(server, apiBaseUrl)
    registerGetVerificationResult(server, apiBaseUrl)

    return server
}
