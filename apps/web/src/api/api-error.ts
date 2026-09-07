export type ApiErrorCategory = 'session-expired' | 'account-unavailable' | 'access-denied' | 'request-failed'

/** Public error metadata only. Provider messages and response bodies never become UI copy. */
export class ApiError extends Error {
    readonly status: number
    readonly category: ApiErrorCategory
    readonly correlationId?: string

    constructor(status: number, category: ApiErrorCategory, correlationId?: string) {
        super('The API request could not be completed.')
        this.name = 'ApiError'
        this.status = status
        this.category = category
        this.correlationId = correlationId
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
    if (currentAccount && response.status === 403) {
        try {
            const body: unknown = await response.clone().json()
            if (typeof body === 'object' && body !== null && 'code' in body) code = body.code
        } catch {
            // A malformed error still retains its HTTP status without exposing raw content.
        }
    }
    const category: ApiErrorCategory =
        response.status === 401
            ? 'session-expired'
            : response.status === 403
              ? currentAccount && code === 'human_session_required'
                  ? 'account-unavailable'
                  : 'access-denied'
              : 'request-failed'
    const suppliedId = response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id')
    const correlationId = suppliedId !== null && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : undefined
    return new ApiError(response.status, category, correlationId)
}
