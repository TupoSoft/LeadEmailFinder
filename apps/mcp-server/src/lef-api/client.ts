import { mapNetworkError, mapUpstreamError, type UpstreamError, type UpstreamErrorCode } from './errors.js'

/** Carries a mapped `UpstreamError` so callers can build a clean tool result from `code`,
 * `message`, and `retryAfterSeconds` without ever touching the raw upstream response. */
export class UpstreamRequestError extends Error {
    readonly code: UpstreamErrorCode
    readonly retryAfterSeconds?: number

    constructor(upstreamError: UpstreamError) {
        super(upstreamError.message)
        this.code = upstreamError.code
        this.retryAfterSeconds = upstreamError.retryAfterSeconds
    }
}

export interface BillingSummary {
    readonly balance: number
    readonly reserved: number
    readonly available: number
}

/** Thin wrapper around the real LeadEmailFinder API. Has no auth concerns of its own: the caller
 * injects a function returning the bearer token to attach, already resolved for the current request. */
export class LefApiClient {
    constructor(
        private readonly apiBaseUrl: string,
        private readonly getAccessToken: () => Promise<string>,
    ) {}

    async getBillingSummary(): Promise<BillingSummary> {
        const token = await this.getAccessToken()

        let response: Response
        try {
            response = await fetch(`${this.apiBaseUrl}/v1/billing/summary`, {
                headers: { Authorization: `Bearer ${token}` },
            })
        } catch {
            throw new UpstreamRequestError(mapNetworkError())
        }

        if (!response.ok) {
            const body = await response.json()
            throw new UpstreamRequestError(mapUpstreamError(response, body))
        }

        return (await response.json()) as BillingSummary
    }
}
