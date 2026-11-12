export type ApiErrorCategory = 'session-expired' | 'account-unavailable' | 'access-denied' | 'request-failed'
export type ApiErrorCode = 'idempotency_key_too_far_ahead'

/** Public error metadata only. Provider messages and response bodies never become UI copy. */
export class ApiError extends Error {
    readonly status: number
    readonly category: ApiErrorCategory
    readonly correlationId?: string
    readonly retryAt?: number
    readonly code?: ApiErrorCode

    constructor(
        status: number,
        category: ApiErrorCategory,
        correlationId?: string,
        retryAt?: number,
        code?: ApiErrorCode,
    ) {
        super('The API request could not be completed.')
        this.name = 'ApiError'
        this.status = status
        this.category = category
        this.correlationId = correlationId
        this.retryAt = retryAt
        this.code = code
    }
}

export class StaleAuthResponseError extends Error {
    constructor() {
        super('The authentication context changed.')
        this.name = 'StaleAuthResponseError'
    }
}

export async function normalizeApiError(response: Response, currentAccount: boolean): Promise<ApiError> {
    let code: unknown
    let message: unknown
    if (response.status === 400 || (currentAccount && response.status === 403)) {
        try {
            const body: unknown = await response.clone().json()
            if (typeof body === 'object' && body !== null) {
                if ('code' in body) code = body.code
                if ('message' in body) message = body.message
            }
        } catch {
            // A malformed error still retains its HTTP status without exposing raw content.
        }
    }
    const category: ApiErrorCategory =
        response.status === 401
            ? 'session-expired'
            : response.status === 403
              ? currentAccount && code === 'email_verification_required'
                  ? 'account-unavailable'
                  : 'access-denied'
              : 'request-failed'
    const suppliedId = response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id')
    const correlationId = suppliedId !== null && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : undefined
    const retryAfter = response.status === 429 ? response.headers.get('retry-after')?.trim() : undefined
    const retryAt = retryAfter
        ? /^\d+$/.test(retryAfter)
            ? Date.now() + Number(retryAfter) * 1000
            : /^[A-Za-z]{3}, /.test(retryAfter)
              ? Date.parse(retryAfter)
              : NaN
        : NaN
    return new ApiError(
        response.status,
        category,
        correlationId,
        Number.isFinite(retryAt) && retryAt >= 0 && retryAt <= 8.64e15 ? retryAt : undefined,
        response.status === 400 && message === 'idempotency_key_too_far_ahead'
            ? 'idempotency_key_too_far_ahead'
            : undefined,
    )
}
