import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'

function errorContent(error: UpstreamRequestError): { content: [{ type: 'text'; text: string }]; isError: true } {
    const body: { code: string; message: string; retryAfterSeconds?: number } = { code: error.code, message: error.message }
    if (error.retryAfterSeconds !== undefined) body.retryAfterSeconds = error.retryAfterSeconds
    return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true }
}

export function registerCheckCreditBalance(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'check_credit_balance',
        { description: "Returns the calling organization's current credit balance, reserved credits, and available credit." },
        async extra => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('check_credit_balance dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const summary = await client.getBillingSummary()
                return { content: [{ type: 'text', text: JSON.stringify(summary) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return errorContent(error)
                throw error
            }
        },
    )
}
