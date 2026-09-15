export const VERIFICATION_COOLDOWN_READER = Symbol('VerificationCooldownReader')

export interface CooldownCandidate {
    readonly resultId: string
    readonly verificationQuality: string
    readonly createdAt: Date
}

/** Reads the latest verification outcome for an address regardless of quality, so admission can detect a recent
 *  terminal inconclusive verdict and apply a brief cooldown before letting a new submission probe the same
 *  address again. Distinct from `VerificationResultCacheReader`, which only ever considers conclusive results. */
export interface VerificationCooldownReader {
    findLatestOutcome(organizationId: string, normalizedAddress: string): Promise<CooldownCandidate | null>
}
