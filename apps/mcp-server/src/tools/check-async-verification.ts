import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export function registerCheckAsyncVerification(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'check_async_verification',
        {
            description:
                'Returns the current status of a previously submitted asynchronous verification: queued, running, ' +
                'completed (with the result), failed (with a failure code), or unavailable.',
            inputSchema: { id: z.string().uuid() },
        },
        async ({ id }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('check_async_verification dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const state = await client.getAsyncVerificationStatus(id)
                return { content: [{ type: 'text', text: JSON.stringify(state) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
