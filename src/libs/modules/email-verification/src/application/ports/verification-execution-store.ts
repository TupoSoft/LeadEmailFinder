export const VERIFICATION_EXECUTION_STORE = Symbol('VERIFICATION_EXECUTION_STORE')

export type VerificationExecutionState =
    | 'funding_pending'
    | 'queued'
    | 'running'
    | 'awaiting_retry'
    | 'settling'
    | 'completed'
    | 'canceled'

export type VerificationFundingOwnerType = 'single' | 'batch_group'

export interface VerificationExecutionRecord {
    readonly executionId: string
    readonly organizationId: string
    readonly normalizedAddress: string
    readonly payerRequestId: string
    readonly state: VerificationExecutionState
    readonly fundingOwnerType: VerificationFundingOwnerType
    readonly fundingOwnerId: string
    readonly attemptGeneration: number
    readonly leaseOwnerId: string | null
    readonly leaseExpiresAt: Date | null
    readonly resultId: string | null
    readonly retryAt: Date | null
    readonly deadlineAt: Date
    readonly createdAt: Date
    readonly updatedAt: Date
}

/** The minimal shape of a candidate cached result, as read from the address's latest verification row, for the
 *  caller-supplied freshness predicate `claimOrJoin` evaluates while holding the address lock. */
export interface CachedResultCandidate {
    readonly resultId: string
    readonly verificationQuality: string
    readonly evidenceObservedAt: Date | null
    readonly evidencePolicyVersion: number
}

export type ClaimAddressOutcome =
    | { readonly kind: 'created'; readonly execution: VerificationExecutionRecord }
    | { readonly kind: 'joined'; readonly execution: VerificationExecutionRecord }
    | { readonly kind: 'cache-available'; readonly resultId: string }

/**
 * Atomic, organization-scoped execution admission and lease fencing for one verification address. Only one
 * nonterminal execution may exist per `(organizationId, normalizedAddress)`; every mutation locks that slot (or
 * the target execution row) before reading or writing, so concurrent admissions and lease operations for one
 * address always resolve through a single serialization point.
 */
export interface VerificationExecutionStore {
    /**
     * Locks the address slot, then re-reads the latest candidate cached result under that same lock and applies
     * `isCandidateUsable` — closing the race where a competitor published a fresh cache entry between the
     * caller's own cache check and this call. A usable candidate reports `cache-available` without admitting new
     * work. Otherwise, an existing nonterminal execution reports `joined`; absent one, inserts a new
     * `funding_pending` row owned (single) by `payerRequestId` and reports `created`.
     */
    claimOrJoin(
        organizationId: string,
        normalizedAddress: string,
        payerRequestId: string,
        newExecutionId: string,
        deadlineAt: Date,
        isCandidateUsable: (candidate: CachedResultCandidate) => boolean,
    ): Promise<ClaimAddressOutcome>

    findById(executionId: string, organizationId: string): Promise<VerificationExecutionRecord | null>

    markQueued(executionId: string, organizationId: string): Promise<VerificationExecutionRecord>

    /** Fences a funding failure: `funding_pending` -> `canceled`, frees the address slot. Idempotent. */
    cancelFundingFailure(executionId: string, organizationId: string): Promise<VerificationExecutionRecord>

    /** Rejects (returns null) for a `queued` execution missing entirely, a terminal one, or an `awaiting_retry`
     *  one whose `retryAt` has not yet passed `now` — a scheduled backoff must not be shortened by an
     *  immediately-driven caller (a synchronous replay, a redispatched queue message) racing the clock. */
    acquireLease(
        executionId: string,
        organizationId: string,
        leaseOwnerId: string,
        leaseExpiresAt: Date,
        now: Date,
    ): Promise<VerificationExecutionRecord | null>

    renewLease(
        executionId: string,
        organizationId: string,
        leaseOwnerId: string,
        generation: number,
        leaseExpiresAt: Date,
    ): Promise<VerificationExecutionRecord | null>

    /** Increments the generation and clears the lease; sets `awaiting_retry`/`retryAt` when retryable, or takes
     *  over an abandoned lease for redispatch. Rejects (returns null) on a stale expected generation or a
     *  terminal state. */
    takeoverForRetry(
        executionId: string,
        organizationId: string,
        expectedGeneration: number,
        retryAt: Date | null,
    ): Promise<VerificationExecutionRecord | null>

    /** No-ops (returns the row unchanged) if a durable capture intention already exists for this execution —
     *  capture always wins over deadline or reconciler cancellation. Otherwise cancels and frees the address
     *  slot. */
    cancelIfNoCaptureIntention(executionId: string, organizationId: string): Promise<VerificationExecutionRecord>

    /** Pages nonterminal rows oldest-`updatedAt`-first, excluding any `fundingOwnerType: 'batch_group'` row. */
    pageNonterminal(limit: number): Promise<readonly VerificationExecutionRecord[]>

    /** Pages `canceled` rows (oldest-`updatedAt`-first, excluding `fundingOwnerType: 'batch_group'`) that still
     *  have at least one linked request with `billingState: 'pending'` — a deadline cancellation whose credit
     *  release and request settlement did not both complete before the process exited or one step failed.
     *  `cancelIfNoCaptureIntention` alone leaves no discoverable trace of that gap, since `canceled` is terminal
     *  and excluded from `pageNonterminal`; this is what lets the reconciler retry the cleanup on a later sweep. */
    pageCanceledPendingCleanup(limit: number): Promise<readonly VerificationExecutionRecord[]>
}
