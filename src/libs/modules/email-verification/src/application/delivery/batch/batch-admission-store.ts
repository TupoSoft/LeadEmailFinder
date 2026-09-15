export const BATCH_ADMISSION_STORE = Symbol('BatchAdmissionStore')

export type BatchAdmissionState = 'validating' | 'admitting' | 'admitted' | 'insufficient_credits' | 'invalid'
export type BatchUniqueAddressAdmissionKind = 'cache' | 'shared' | 'created' | 'cooldown'

export interface BatchAdmissionRecord {
    readonly batchId: string
    readonly organizationId: string
    readonly state: BatchAdmissionState
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

    updateState(batchId: string, organizationId: string, state: BatchAdmissionState): Promise<void>

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

    /** Sets the admission outcome for one address. A no-op once that address already has a recorded outcome. */
    recordAdmissionOutcome(
        batchId: string,
        normalizedAddress: string,
        outcome: {
            readonly admissionKind: BatchUniqueAddressAdmissionKind
            readonly executionId: string | null
            readonly resultId: string | null
        },
    ): Promise<void>

    recordPayerRequestId(batchId: string, normalizedAddress: string, payerRequestId: string): Promise<void>

    /** Counts unique addresses in this batch whose payer request either has no `payerRequestId` yet (admission
     *  itself is still in progress) or whose linked `VerificationRequestStore` row is not yet `billingState:
     *  'settled'`. Zero means the batch is safe to move on to result publication. */
    countUnsettledAddresses(batchId: string, organizationId: string): Promise<number>

    /** Aggregate per-address status counts for the public status endpoint. `conclusive`/`inconclusive`/`failed`
     *  are counted only among `created` addresses (a freshly probed execution's own outcome) — `cache`/`shared`/
     *  `cooldown` are separate, stable admission-time categories, not double-counted into them. */
    getStatusCounts(batchId: string, organizationId: string): Promise<BatchStatusCounts>
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
