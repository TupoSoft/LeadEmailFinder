import { VerificationFinalReason, VerificationRequestRecord, VerificationRequestSource } from '../ports/verification-request-store'

export interface VerificationOperationBilling {
    readonly state: 'pending' | 'settled'
    readonly reserved: 0 | 1
    readonly charged: 0 | 1
    /** Present only once settlement is confirmed — a pending count is an authoritative snapshot, never an
     *  estimated deduction. */
    readonly reason?: VerificationFinalReason
}

export interface VerificationOperationMetadata {
    readonly id: string
    readonly source: VerificationRequestSource
    /** The underlying evidence's observation time, never HTTP request time. `null` before a result exists. */
    readonly observedAt: string | null
    /** Only set for a conclusive result — the timestamp after which a fresh probe (rather than free cache reuse)
     *  is required for this address. */
    readonly cacheExpiresAt: string | null
    readonly billing: VerificationOperationBilling
}

/** Builds the additive `operation` metadata block shared by the sync completed response and the async status
 *  response. A plain, framework-free value — the HTTP layer coerces it into its own decorated DTO class for
 *  serialization, so this stays independent of class-transformer/Nest. */
export function buildOperationMetadata(
    request: VerificationRequestRecord,
    evidenceObservedAt: Date | null,
    cacheTtlMs: number,
): VerificationOperationMetadata {
    const billing: VerificationOperationBilling = {
        state: request.billingState,
        reserved: request.reservedCount,
        charged: request.chargedCount,
        ...(request.billingState === 'settled' && request.finalReason !== null
            ? { reason: request.finalReason }
            : {}),
    }

    return {
        id: request.requestId,
        source: request.source,
        observedAt: evidenceObservedAt ? evidenceObservedAt.toISOString() : null,
        cacheExpiresAt:
            request.finalReason === 'conclusive' && evidenceObservedAt !== null
                ? new Date(evidenceObservedAt.getTime() + cacheTtlMs).toISOString()
                : null,
        billing,
    }
}
