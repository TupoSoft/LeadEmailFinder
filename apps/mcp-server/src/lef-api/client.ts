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

/** Matches `EmailVerificationResponseDto` (`src/libs/modules/email-verification/src/api/email-verification-response.dto.ts`)
 * as actually serialized over HTTP -- `createdAt` is `toClassOnly` and never appears on the wire, and `operation`
 * is only ever populated on the synchronous route's completed (`201`) response, never on `GET /verifications/:id`. */
export interface EmailVerificationResult {
    readonly id: string
    readonly email: string
    readonly localPart: string
    readonly domain: string
    readonly format?: string
    readonly exists: boolean | null
    readonly catchAll: boolean | null
    readonly reason: string
    readonly sources: string[]
    readonly mxDomain?: string
    readonly targetExchange?: string
    readonly evidenceObservedAt?: string | null
}

export type VerificationRequestSource = 'fresh' | 'cache' | 'shared'
export type VerificationFinalReason = 'conclusive' | 'cached' | 'shared' | 'inconclusive' | 'failed'

export interface VerificationOperationBilling {
    readonly state: 'pending' | 'settled'
    readonly reserved: 0 | 1
    readonly charged: 0 | 1
    readonly reason?: VerificationFinalReason
}

export interface VerificationOperationMetadata {
    readonly id: string
    readonly source: VerificationRequestSource
    readonly observedAt: string | null
    readonly cacheExpiresAt: string | null
    readonly billing: VerificationOperationBilling
}

export type VerifySyncOutcome =
    | { readonly kind: 'completed'; readonly result: EmailVerificationResult & { readonly operation: VerificationOperationMetadata } }
    | { readonly kind: 'accepted'; readonly id: string }

export type AsyncVerificationState =
    | { readonly state: 'queued' }
    | { readonly state: 'running' }
    | { readonly state: 'completed'; readonly result: EmailVerificationResult; readonly operation?: VerificationOperationMetadata }
    | { readonly state: 'failed'; readonly failureCode: 'verification_failed'; readonly operation?: VerificationOperationMetadata }
    | { readonly state: 'unavailable' }

export type BatchJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'unavailable'
export type BatchTerminalFailureCode = 'invalid_csv' | 'insufficient_credits' | 'processing_failed'

/** Matches `BatchStatusAddressCountsDto`. `cached`/`shared`/`cooldown` are stable admission-time
 * categories; `completed`/`conclusive`/`inconclusive`/`failed` count only newly created addresses. */
export interface BatchStatusAddressCounts {
    readonly totalRows: number
    readonly uniqueAddresses: number
    readonly duplicateRows: number
    readonly cachedAddresses: number
    readonly sharedAddresses: number
    readonly cooldownAddresses: number
    readonly completedAddresses: number
    readonly conclusiveAddresses: number
    readonly inconclusiveAddresses: number
    readonly failedAddresses: number
}

export interface BatchStatusBilling {
    readonly state: 'pending' | 'settled'
    readonly reserved: number
    readonly charged: number
}

/** Matches `GetBatchStatusResponseDto`. */
export interface BatchStatus {
    readonly id: string
    readonly status: BatchJobStatus
    readonly failureCode?: BatchTerminalFailureCode
    readonly progress: number
    readonly total: number
    readonly processed: number
    readonly unprocessed: number
    readonly resultsAvailable: boolean
    readonly counts: BatchStatusAddressCounts
    readonly billing: BatchStatusBilling
}

/** Thin wrapper around the real LeadEmailFinder API. Has no auth concerns of its own: the caller
 * injects a function returning the bearer token to attach, already resolved for the current request. */
export class LefApiClient {
    constructor(
        private readonly apiBaseUrl: string,
        private readonly getAccessToken: () => Promise<string>,
    ) {}

    async getBillingSummary(): Promise<BillingSummary> {
        return this.parseOrThrow<BillingSummary>(await this.request('/v1/billing/summary'))
    }

    /** The API admits and drives the verification inline up to its own bounded budget. `202` (rather than a
     * non-2xx status) signals the budget was exhausted and the caller must poll `getAsyncVerificationStatus`
     * with the returned id instead -- this is documented, expected behavior, never an error. */
    async verifySync(email: string): Promise<VerifySyncOutcome> {
        const response = await this.request('/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        })
        if (response.status === 202) {
            const body = (await response.json()) as { id: string }
            return { kind: 'accepted', id: body.id }
        }
        const result = await this.parseOrThrow<EmailVerificationResult & { operation: VerificationOperationMetadata }>(response)
        return { kind: 'completed', result }
    }

    async submitAsyncVerification(email: string): Promise<{ id: string }> {
        const response = await this.request('/verifyAsync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        })
        return this.parseOrThrow(response)
    }

    async getAsyncVerificationStatus(id: string): Promise<AsyncVerificationState> {
        const response = await this.request(`/verifyAsync/${encodeURIComponent(id)}`)
        return this.parseOrThrow(response)
    }

    async getVerificationResult(id: string): Promise<EmailVerificationResult> {
        const response = await this.request(`/verifications/${encodeURIComponent(id)}`)
        return this.parseOrThrow(response)
    }

    /** Uploads a single-column CSV built by the caller as a batch. No `Content-Type` header is set
     * here -- `fetch` derives the multipart boundary from the `FormData` body itself. */
    async uploadBatchCsv(csvContent: string): Promise<{ id: string }> {
        const form = new FormData()
        form.append('file', new Blob([csvContent], { type: 'text/csv' }), 'batch.csv')
        const response = await this.request('/verifyBatch/csv', { method: 'POST', body: form })
        return this.parseOrThrow(response)
    }

    async getBatchStatus(id: string): Promise<BatchStatus> {
        const response = await this.request(`/verifyBatch/${encodeURIComponent(id)}`)
        return this.parseOrThrow(response)
    }

    /** Fetches the raw result CSV text -- parsing is the caller's responsibility, keeping this
     * client's own responsibility limited to HTTP transport, same as every other method here. */
    async getBatchResultsCsv(id: string): Promise<string> {
        const response = await this.request(`/verifyBatch/${encodeURIComponent(id)}/results`)
        if (!response.ok) await this.throwMappedError(response)
        return await response.text()
    }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        const token = await this.getAccessToken()
        try {
            return await fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
        } catch {
            throw new UpstreamRequestError(mapNetworkError())
        }
    }

    private async throwMappedError(response: Response): Promise<never> {
        const body = await response.json()
        throw new UpstreamRequestError(mapUpstreamError(response, body))
    }

    private async parseOrThrow<T>(response: Response): Promise<T> {
        if (!response.ok) await this.throwMappedError(response)
        return (await response.json()) as T
    }
}
