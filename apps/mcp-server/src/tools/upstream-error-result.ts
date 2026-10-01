import type { UpstreamRequestError } from '../lef-api/client.js'

interface UpstreamErrorBody {
    code: string
    message: string
    retryAfterSeconds?: number
}

/** Every tool built on `LefApiClient` reports a caught `UpstreamRequestError` the same way: an
 * `isError` text result surfacing only `code`, `message`, and `retryAfterSeconds` when present. */
export function upstreamErrorResult(error: UpstreamRequestError): { content: [{ type: 'text'; text: string }]; isError: true } {
    const body: UpstreamErrorBody = { code: error.code, message: error.message }
    if (error.retryAfterSeconds !== undefined) body.retryAfterSeconds = error.retryAfterSeconds
    return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true }
}
