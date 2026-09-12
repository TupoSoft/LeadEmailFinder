export const VERIFICATION_RESULT_CACHE_READER = Symbol('VERIFICATION_RESULT_CACHE_READER')

export interface VerificationResultCacheCandidate {
    readonly resultId: string
    readonly verificationQuality: string
    readonly evidenceObservedAt: Date | null
    readonly evidencePolicyVersion: number
}

/** Reads the latest verification result for one organization/address, for the admission service to test with
 *  the pure `isCachedResultUsable`. Distinct from the existing UUID-keyed `VerificationResultReader`, which
 *  serves the unrelated `GET /verifications/:id` route. */
export interface VerificationResultCacheReader {
    findLatestCandidate(
        organizationId: string,
        normalizedAddress: string,
    ): Promise<VerificationResultCacheCandidate | null>
}
