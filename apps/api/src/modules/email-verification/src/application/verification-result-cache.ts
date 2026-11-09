import { VERIFICATION_EVIDENCE_POLICY_VERSION } from '../domain/verification-evidence'

export interface CacheableResult {
    readonly verificationQuality: string
    readonly evidenceObservedAt: Date | null
    readonly evidencePolicyVersion: number
}

/**
 * A cached result is billable-free reuse only when it is settled conclusive evidence at the current policy
 * version, with an observed time strictly within the configured TTL of `now`. `evidenceObservedAt` is the oldest
 * evidence the conclusion required (see `deriveEvidenceObservedAt`); reading it here never advances it.
 */
export function isCachedResultUsable(record: CacheableResult, now: Date, cacheTtlMs: number): boolean {
    if (record.verificationQuality === 'inconclusive') return false
    if (record.evidencePolicyVersion !== VERIFICATION_EVIDENCE_POLICY_VERSION) return false
    if (record.evidenceObservedAt === null) return false

    const observedAtMs = record.evidenceObservedAt.getTime()
    if (!Number.isFinite(observedAtMs)) return false

    return now.getTime() < observedAtMs + cacheTtlMs
}
