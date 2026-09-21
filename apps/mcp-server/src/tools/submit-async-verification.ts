import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export function registerSubmitAsyncVerification(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'submit_async_verification',
        {
            description: 'Submits one email address for asynchronous verification and returns an id to poll with check_async_verification.',
            inputSchema: { email: z.string().email() },
        },
        async ({ email }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('submit_async_verification dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const submission = await client.submitAsyncVerification(email)
                return { content: [{ type: 'text', text: JSON.stringify(submission) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
