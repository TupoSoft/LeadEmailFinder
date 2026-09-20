import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

export function registerVerifyEmail(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'verify_email',
        {
            description:
                'Verifies one email address synchronously and returns the result. If the address cannot be ' +
                'resolved within the time budget, returns an id to poll with check_async_verification instead ' +
                'of blocking or erroring.',
            inputSchema: { email: z.string().email() },
        },
        async ({ email }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('verify_email dispatched without a resolved bearer token')

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const outcome = await client.verifySync(email)
                if (outcome.kind === 'accepted') {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Verification is still in progress. Poll check_async_verification with id "${outcome.id}" for the result.`,
                            },
                        ],
                    }
                }
                return { content: [{ type: 'text', text: JSON.stringify(outcome.result) }] }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
