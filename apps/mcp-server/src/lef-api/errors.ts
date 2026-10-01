export type UpstreamErrorCode =
    | 'authentication_required'
    | 'insufficient_credits'
    | 'permission_denied'
    | 'not_found'
    | 'validation_failed'
    | 'rate_limited'
    | 'service_unavailable'
    | 'unexpected_upstream_error'

export interface UpstreamError {
    readonly code: UpstreamErrorCode
    readonly message: string
    readonly retryAfterSeconds?: number
}

const validationFailed = { code: 'validation_failed' as const, message: 'The request failed validation.' }

const statusMessages: Readonly<Record<number, { code: UpstreamErrorCode; message: string }>> = {
    400: validationFailed,
    401: { code: 'authentication_required', message: 'Authentication is required or the credential was rejected.' },
    402: { code: 'insufficient_credits', message: 'The organization does not have enough available credit for this operation.' },
    403: { code: 'permission_denied', message: 'The credential lacks the required permission.' },
    404: { code: 'not_found', message: 'The requested resource was not found.' },
    422: validationFailed,
    429: { code: 'rate_limited', message: 'Too many requests. Retry after the given delay.' },
    503: { code: 'service_unavailable', message: 'The upstream service is temporarily unavailable.' },
}

const unexpectedUpstreamError: UpstreamError = {
    code: 'unexpected_upstream_error',
    message: 'An unexpected error occurred while calling the upstream service.',
}

function parseRetryAfterSeconds(response: Response): number | undefined {
    const header = response.headers.get('Retry-After')
    if (header === null) return undefined
    const seconds = Number(header)
    return Number.isFinite(seconds) ? seconds : undefined
}

/** Maps a non-2xx upstream response to a stable, non-leaking tool error. `body` is accepted for
 * signature symmetry with future needs but is never inspected or interpolated into `message` --
 * only a fixed, per-code message and (for 429/503) the response's own `Retry-After` header are used. */
export function mapUpstreamError(response: Response, _body: unknown): UpstreamError {
    const mapped = statusMessages[response.status]
    if (!mapped) return unexpectedUpstreamError

    const retryAfterSeconds = response.status === 429 || response.status === 503 ? parseRetryAfterSeconds(response) : undefined
    return retryAfterSeconds === undefined ? { code: mapped.code, message: mapped.message } : { ...mapped, retryAfterSeconds }
}

/** Maps a thrown network/transport failure (connection refused, timeout, DNS failure -- never a
 * `Response`) to the same generic code, without inspecting the thrown error for anything sensitive. */
export function mapNetworkError(): UpstreamError {
    return unexpectedUpstreamError
}
