import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { LefApiClient, UpstreamRequestError } from '../lef-api/client.js'
import { upstreamErrorResult } from './upstream-error-result.js'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export function registerDownloadBatchResults(server: McpServer, apiBaseUrl: string): void {
    server.registerTool(
        'download_batch_results',
        {
            description:
                'Returns a page of row-level batch verification results as JSON. Call check_batch_verification ' +
                'first for aggregate counts -- most "how did it go" questions do not need row-level data at all. ' +
                `Returns at most ${MAX_LIMIT} rows per call regardless of the requested limit.`,
            inputSchema: {
                id: z.string().uuid(),
                offset: z.number().int().min(0).optional(),
                limit: z.number().int().min(1).optional(),
            },
        },
        async ({ id, offset, limit }, extra) => {
            const token = extra.authInfo?.token
            if (!token) throw new Error('download_batch_results dispatched without a resolved bearer token')

            const effectiveOffset = offset ?? 0
            const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

            const client = new LefApiClient(apiBaseUrl, () => Promise.resolve(token))
            try {
                const status = await client.getBatchStatus(id)
                if (!status.resultsAvailable) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text:
                                    'Results are not available yet. Call check_batch_verification and wait for ' +
                                    'resultsAvailable to become true before downloading.',
                            },
                        ],
                        isError: true,
                    }
                }

                const csvContent = await client.getBatchResultsCsv(id)
                const rows: Record<string, string>[] = parse(csvContent, { columns: true })
                const page = rows.slice(effectiveOffset, effectiveOffset + effectiveLimit)
                const nextOffset = effectiveOffset + page.length < rows.length ? effectiveOffset + page.length : null

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ rows: page, totalRows: rows.length, truncated: nextOffset !== null, nextOffset }),
                        },
                    ],
                }
            } catch (error) {
                if (error instanceof UpstreamRequestError) return upstreamErrorResult(error)
                throw error
            }
        },
    )
}
