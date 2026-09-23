import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { stringify } from 'csv-stringify/sync'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export const MAX_BATCH_ADDRESSES = 5000

export function registerSubmitBatchVerification(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'submit_batch_verification',
        {
            description:
                `Submits a list of email addresses (1 to ${MAX_BATCH_ADDRESSES}) for batch verification and ` +
                'returns an id to poll with check_batch_verification. Builds the CSV upload internally -- no ' +
                'local file is needed.',
            inputSchema: { emails: z.array(z.string()).min(1).max(MAX_BATCH_ADDRESSES) },
        },
        async ({ emails }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('submit_batch_verification dispatched without a resolved bearer token')

            const csvContent = stringify(
                emails.map(email => [email]),
                { header: true, columns: ['email'] },
            )

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const { id } = await client.uploadBatchCsv(csvContent)
                return { content: [{ type: 'text', text: JSON.stringify({ id }) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
