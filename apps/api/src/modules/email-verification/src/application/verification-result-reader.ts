import { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'

export const VERIFICATION_RESULT_READER = Symbol('VERIFICATION_RESULT_READER')

export interface VerificationResultLookup {
    id: string
    organizationId: string
}

/** The existing public result shape plus the evidence observation time — an own field, not added to the shared
 *  `IEmailVerificationResponseDto`, so the async completed-result allowlist (a distinct type built from the same
 *  base) does not silently widen alongside it. */
export type VerificationResultDetail = IEmailVerificationResponseDto & { readonly evidenceObservedAt: Date | null }

export interface VerificationResultReader {
    /** Returns null for a missing, foreign, or not-yet-settlement-confirmed result — indistinguishable from
     *  absent, so a guessed UUID for an in-flight execution cannot leak its eventual outcome early. */
    findOwned(lookup: VerificationResultLookup): Promise<VerificationResultDetail | null>
}
