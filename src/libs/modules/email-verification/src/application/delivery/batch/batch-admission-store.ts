export const BATCH_ADMISSION_STORE = Symbol('BatchAdmissionStore')

export type BatchAdmissionState =
    | 'validating'
    | 'admitting'
    | 'funding'
    | 'admitted'
    | 'insufficient_credits'
    | 'invalid'
export type BatchUniqueAddressAdmissionKind = 'cache' | 'shared' | 'created' | 'cooldown'

/** `closed` is a terminal gate owned by terminal batch-failure cleanup; admission never reopens it. */
export type BatchFundingDecision = 'pending' | 'approved' | 'denied' | 'closed'

/** `ready` means every manifest address has its matching receipt, not that billing has settled. */
export type BatchFinalizationState = 'preparing' | 'ready'

/**
 * The address work an admission phase still has to do, derived from persisted state rather than a cursor column:
 * `resolution` rows have no outcome yet, `queue`/`cancellation` rows are owned executions still `funding_pending`,
 * and `materialization` rows lack their matching receipt.
 */
export type BatchAdmissionPhase = 'resolution' | 'queue' | 'cancellation' | 'materialization'

/** Proof of the current admission owner. `now` is the caller's clock reading, so every guarded write rejects an
 *  owner whose lease has expired in the database even before another worker takes the group over. */
export interface BatchAdmissionFence {
    readonly ownerId: string
    readonly generation: number
    readonly now: Date
}

export type BatchAdmissionLeaseOutcome =
    | { readonly kind: 'acquired'; readonly generation: number; readonly record: BatchAdmissionRecord }
    | { readonly kind: 'busy'; readonly leaseExpiresAt: Date }

/** `stale` means the fence no longer owns the group (expired, released, or superseded by a newer generation) or the
 *  group has left the state the write requires; the caller must stop without advancing anything. */
export type BatchAdmissionGuardedWrite = 'applied' | 'stale'

/** A guarded write that also verifies a persisted precondition; `incomplete` means the fence still owns the group
 *  but the precondition does not hold yet. */
export type BatchAdmissionCheckedWrite = 'applied' | 'stale' | 'incomplete'

export interface BatchAdmissionRecord {
    readonly batchId: string
    readonly organizationId: string
    readonly state: BatchAdmissionState
    readonly fundingDecision: BatchFundingDecision
    readonly finalizationState: BatchFinalizationState
    readonly admissionLeaseOwnerId: string | null
    readonly admissionLeaseExpiresAt: Date | null
    readonly admissionGeneration: number
    readonly totalRows: number
    readonly uniqueAddressCount: number
    readonly clientRequestKey: string | null
    readonly contentDigest: string | null
    readonly createdAt: Date
    readonly updatedAt: Date
}

export interface BatchUniqueAddressRecord {
    readonly batchId: string
    readonly normalizedAddress: string
    readonly firstSeenRow: number
    readonly admissionKind: BatchUniqueAddressAdmissionKind | null
    readonly executionId: string | null
    readonly resultId: string | null
    /** Reserved receipt identity; a non-null UUID does not prove that its request row exists yet. */
    readonly payerRequestId: string | null
}

export interface NewBatchAdmissionInput {
    readonly batchId: string
    readonly organizationId: string
    readonly totalRows: number
    readonly uniqueAddressCount: number
    readonly clientRequestKey: string | null
    readonly contentDigest: string | null
}

export type CreateBatchAdmissionOutcome =
    | { readonly kind: 'created'; readonly record: BatchAdmissionRecord }
    | { readonly kind: 'replayed'; readonly record: BatchAdmissionRecord }
    | { readonly kind: 'key-conflict' }

/**
 * The durable batch-upload manifest: one `BatchAdmissionRecord` per upload plus one immutable
 * `BatchUniqueAddressRecord` per unique normalized address it contains. `admissionKind` records how that address
 * was resolved (`cache`/`shared`/`created`/`cooldown`); the exact list of executions this batch must fund is the
 * set of rows whose `admissionKind` is `'created'` — no separate list is stored. Repeating an insert or an
 * outcome write for an address already recorded is a safe no-op, so a crashed/retried admission pass resumes
 * exactly where it left off instead of re-claiming or re-reserving anything.
 */
export interface BatchAdmissionStore {
    /** Creates the admission row, or replays the existing one for a repeated client key whose digest matches.
     *  A repeated key with a different digest conflicts without mutation. */
    createOrReplay(input: NewBatchAdmissionInput): Promise<CreateBatchAdmissionOutcome>

    findById(batchId: string, organizationId: string): Promise<BatchAdmissionRecord | null>

    findByClientKey(organizationId: string, clientRequestKey: string): Promise<BatchAdmissionRecord | null>

    /** Idempotent: an address already recorded for this batch is left untouched. */
    insertUniqueAddresses(
        batchId: string,
        organizationId: string,
        addresses: readonly { normalizedAddress: string; firstSeenRow: number }[],
    ): Promise<void>

    /** Ordered by `firstSeenRow` ascending, paged. */
    pageUniqueAddresses(
        batchId: string,
        organizationId: string,
        skip: number,
        take: number,
    ): Promise<readonly BatchUniqueAddressRecord[]>

    /** Sets the admission outcome for one address while the fence owns an `admitting` group. A no-op once that
     *  address already has a recorded outcome; `stale` once the group is frozen or owned by another generation. */
    recordAdmissionOutcome(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        normalizedAddress: string,
        outcome: {
            readonly admissionKind: BatchUniqueAddressAdmissionKind
            readonly executionId: string | null
            readonly resultId: string | null
        },
    ): Promise<BatchAdmissionGuardedWrite>

    /** Assigns the candidate only while empty and returns the stored winner, including on concurrent retry.
     *  Requires the batch, organization, and address to match; missing or foreign manifests fail unchanged.
     *  Once assigned, the identity is immutable and may precede request insertion. */
    ensurePayerRequestId(
        batchId: string,
        organizationId: string,
        normalizedAddress: string,
        candidateId: string,
    ): Promise<string>

    /** Counts addresses whose receipt identity is unassigned, whose request row is missing, or whose linked
     *  request is not yet `billingState: 'settled'`. Zero means the batch is safe to publish its results. */
    countUnsettledAddresses(batchId: string, organizationId: string): Promise<number>

    /** Aggregate per-address status counts for the public status endpoint. `conclusive`/`inconclusive`/`failed`
     *  are counted only among `created` addresses (a freshly probed execution's own outcome) — `cache`/`shared`/
     *  `cooldown` are separate, stable admission-time categories, not double-counted into them. */
    getStatusCounts(batchId: string, organizationId: string): Promise<BatchStatusCounts>

    /** Takes the group's admission lease when it is absent or expired at `now`, incrementing the generation so every
     *  earlier owner's writes fail. A live lease held by another owner reports `busy` without mutation. */
    claimAdmissionLease(
        batchId: string,
        organizationId: string,
        ownerId: string,
        now: Date,
        leaseExpiresAt: Date,
    ): Promise<BatchAdmissionLeaseOutcome>

    /** Extends a still-valid lease. Returns false once it expired, was released, or was superseded; a late renewal
     *  can therefore never restore a released lease. */
    renewAdmissionLease(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        leaseExpiresAt: Date,
    ): Promise<boolean>

    /** Clears the owner and expiry only while this generation still holds them, touching `updatedAt` so recovery
     *  rotates fairly through groups. The generation is kept, so the released owner's later writes stay stale. */
    releaseAdmissionLease(batchId: string, organizationId: string, fence: BatchAdmissionFence): Promise<void>

    /** Moves the group between admission states under the fence. */
    transitionState(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        from: BatchAdmissionState,
        to: BatchAdmissionState,
    ): Promise<BatchAdmissionGuardedWrite>

    /** Groups recovery may advance at `now`: unfinished validating/admitting/funding groups and admitted or
     *  insufficient-credit groups still preparing receipts, excluding live leases and `closed` decisions. Ordered by
     *  `updatedAt ASC, batchId ASC`. */
    pageRecoverableGroups(now: Date, limit: number): Promise<readonly BatchAdmissionRecord[]>

    /** Addresses the phase still has to handle, filtered in SQL from persisted state, ordered by `firstSeenRow`
     *  strictly after `afterFirstSeenRow`. Pass `-1` to start from the first incomplete row. */
    pageIncompleteAddresses(
        batchId: string,
        organizationId: string,
        phase: BatchAdmissionPhase,
        afterFirstSeenRow: number,
        limit: number,
    ): Promise<readonly BatchUniqueAddressRecord[]>

    /** Under the group row lock, verifies that the manifest holds every unique address, every address is resolved,
     *  and every `created` address names an execution this batch owns for that address; then enters `funding`.
     *  From then on the outcomes and owned-operation list are immutable. */
    freezeFundingManifest(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite>

    /** The frozen owned-operation list: every `created` address's execution, in `firstSeenRow` order. */
    listOwnedExecutionIds(batchId: string, organizationId: string): Promise<readonly string[]>

    /** Records `approved` or `denied` for a `funding` group whose decision is still `pending`. */
    recordFundingDecision(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        decision: 'approved' | 'denied',
    ): Promise<BatchAdmissionGuardedWrite>

    /** Sets finalization `ready` for an admitted or insufficient-credit group only once every manifest address has
     *  its matching receipt; `incomplete` while any receipt is still missing. */
    markFinalizationReady(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite>
}

export interface BatchStatusCounts {
    readonly cachedAddresses: number
    readonly sharedAddresses: number
    readonly cooldownAddresses: number
    readonly completedAddresses: number
    readonly conclusiveAddresses: number
    readonly inconclusiveAddresses: number
    readonly failedAddresses: number
    readonly reserved: number
    readonly charged: number
}
