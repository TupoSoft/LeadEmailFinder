import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export function registerCheckBatchVerification(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'check_batch_verification',
        {
            description:
                'Returns the current status of a previously submitted batch: job state, progress, per-address ' +
                'counts, and billing. Use this for an overall summary before calling download_batch_results for ' +
                'row-level data.',
            inputSchema: { id: z.string().uuid() },
        },
        async ({ id }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('check_batch_verification dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const status = await client.getBatchStatus(id)
                return { content: [{ type: 'text', text: JSON.stringify(status) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
