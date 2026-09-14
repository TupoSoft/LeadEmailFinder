import { NewEmailVerification } from '../../domain/email-verification'
import { VerificationFinalReason } from './verification-request-store'

export const VERIFICATION_SETTLEMENT_STORE = Symbol('VERIFICATION_SETTLEMENT_STORE')

export type VerificationSettlementDecision = 'capture' | 'release'
export type VerificationSettlementState = 'pending' | 'confirmed'

export interface VerificationSettlementIntentionRecord {
    readonly executionId: string
    readonly organizationId: string
    readonly decision: VerificationSettlementDecision
    readonly resultId: string
    readonly state: VerificationSettlementState
    readonly createdAt: Date
    readonly confirmedAt: Date | null
}

export interface PersistResultInput {
    readonly executionId: string
    readonly organizationId: string
    readonly expectedGeneration: number
    readonly newVerification: NewEmailVerification
    readonly decision: VerificationSettlementDecision
    readonly finalReason: VerificationFinalReason
}

export type PersistResultOutcome =
    | { readonly kind: 'persisted'; readonly resultId: string; readonly intention: VerificationSettlementIntentionRecord }
    | { readonly kind: 'already-persisted'; readonly resultId: string; readonly intention: VerificationSettlementIntentionRecord }
    | { readonly kind: 'stale-generation' }
    | { readonly kind: 'terminal' }

/**
 * Persists at most one result per execution together with its immutable capture-or-release intention, in one
 * transaction, guarded by the execution still being active with the expected attempt generation. Confirming
 * settlement flips the execution and every request linked to it terminal in the same transaction, so a crash
 * between result persistence and settlement confirmation always recovers to exactly one terminal outcome.
 */
export interface VerificationSettlementStore {
    persistResultAndIntention(input: PersistResultInput): Promise<PersistResultOutcome>

    findIntention(executionId: string, organizationId: string): Promise<VerificationSettlementIntentionRecord | null>

    /** Idempotent: replaying an already-confirmed intention returns the (unchanged) execution record. Returns
     *  the settled address and result-existence flag too, so the caller can advance the email cache's
     *  last-verification link without a second lookup outside this transaction. */
    confirmSettlement(
        executionId: string,
        organizationId: string,
    ): Promise<{ readonly resultId: string; readonly normalizedAddress: string; readonly exists: boolean | null }>

    pagePendingIntentions(limit: number): Promise<readonly VerificationSettlementIntentionRecord[]>
}
