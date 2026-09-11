export const VERIFICATION_REQUEST_STORE = Symbol('VERIFICATION_REQUEST_STORE')

/** Matches the delivery-mode vocabulary already used by `VerificationTraceContext`/`logging-verification-trace-observer.ts`. */
export type VerificationDeliveryMode = 'sync' | 'async' | 'batch' | 'batch_child'
export type VerificationRequestSource = 'fresh' | 'cache' | 'shared'
export type VerificationBillingState = 'pending' | 'settled'
export type VerificationFinalReason = 'conclusive' | 'cached' | 'shared' | 'inconclusive' | 'failed'

export interface VerificationRequestRecord {
    readonly requestId: string
    readonly organizationId: string
    readonly normalizedAddress: string
    readonly deliveryMode: VerificationDeliveryMode
    readonly clientRequestKey: string | null
    readonly executionId: string | null
    readonly resultId: string | null
    readonly source: VerificationRequestSource
    readonly billingState: VerificationBillingState
    readonly reservedCount: 0 | 1
    readonly chargedCount: 0 | 1
    readonly finalReason: VerificationFinalReason | null
    readonly createdAt: Date
    readonly settledAt: Date | null
}

export interface NewVerificationRequestInput {
    readonly requestId: string
    readonly organizationId: string
    readonly normalizedAddress: string
    readonly deliveryMode: VerificationDeliveryMode
    readonly clientRequestKey: string | null
    readonly source: VerificationRequestSource
    readonly executionId: string | null
    readonly resultId: string | null
    /** Whether this specific request actually holds a reservation right now — the caller decides this from the
     *  real credit outcome, since a `'fresh'` source that failed with insufficient funds reserves nothing. */
    readonly reservedCount: 0 | 1
    /** The caller decides terminal state at insert time too: a cache hit or a fenced insufficient-funds denial
     *  is already settled with no execution ever created; a joined or funded request stays pending until the
     *  execution it is linked to eventually settles. */
    readonly billingState: VerificationBillingState
    readonly finalReason: VerificationFinalReason | null
}

export type InsertRequestOutcome =
    | { readonly kind: 'inserted'; readonly record: VerificationRequestRecord }
    | { readonly kind: 'replayed'; readonly record: VerificationRequestRecord }
    | { readonly kind: 'key-conflict' }

/**
 * Durable record of one caller submission. `requestId` is the public recovery handle; `clientRequestKey` is the
 * caller-supplied idempotency key, unique per organization when supplied. Followers of a shared or joined
 * execution get their own request row with zero reserved/charged credits; only the payer request ever reserves.
 */
export interface VerificationRequestStore {
    findByClientKey(organizationId: string, clientRequestKey: string): Promise<VerificationRequestRecord | null>

    /** Inserts a new request, or replays the existing row for a repeated client key with matching input. A
     *  repeated key with a different normalized address or delivery mode conflicts without mutation. */
    insert(input: NewVerificationRequestInput): Promise<InsertRequestOutcome>

    findById(requestId: string, organizationId: string): Promise<VerificationRequestRecord | null>

    attachExecution(requestId: string, organizationId: string, executionId: string): Promise<void>
}
