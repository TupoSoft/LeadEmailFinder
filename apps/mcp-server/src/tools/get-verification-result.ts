import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export function registerGetVerificationResult(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'get_verification_result',
        {
            description: 'Looks up a previously produced verification result by its own id, scoped to the calling organization.',
            inputSchema: { id: z.string().uuid() },
        },
        async ({ id }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('get_verification_result dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const result = await client.getVerificationResult(id)
                return { content: [{ type: 'text', text: JSON.stringify(result) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
