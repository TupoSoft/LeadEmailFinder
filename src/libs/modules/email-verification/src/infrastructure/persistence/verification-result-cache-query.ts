import { EntityManager, In } from 'typeorm'
import { VerificationResultCacheCandidate } from '../../application/ports/verification-result-cache-reader'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'

/** A result with no settlement intention at all is legacy/batch-produced and stays visible immediately; a result
 *  whose intention exists but is not yet `confirmed` is treated as though it does not exist yet, closing the
 *  window where a guessed or polled UUID could observe a result before its settlement is durable. */
async function isSettlementConfirmed(manager: EntityManager, resultId: string): Promise<boolean> {
    const intention = await manager.findOneBy(VerificationSettlementIntentionEntity, { resultId })
    return !intention || intention.state === 'confirmed'
}

/** Shared by `TypeOrmVerificationResultCacheReader` (the admission service's own pre-lock check) and
 *  `TypeOrmVerificationExecutionStore` (the under-lock recheck inside `claimOrJoin`) so both query the same
 *  "latest settled conclusive result for this address" definition. Filtering quality in the query, not only in
 *  the pure freshness check afterward, means a later inconclusive probe can never mask an earlier, still-fresh
 *  conclusive one. */
export async function queryLatestCacheCandidate(
    manager: EntityManager,
    organizationId: string,
    normalizedAddress: string,
): Promise<VerificationResultCacheCandidate | null> {
    const latest = await manager.findOne(EmailVerificationEntity, {
        where: {
            organizationId,
            email: normalizedAddress,
            verificationQuality: In(['conclusive_positive', 'conclusive_negative']),
        },
        order: { createdAt: 'DESC' },
    })
    if (!latest) return null
    if (!(await isSettlementConfirmed(manager, latest.id))) return null

    return {
        resultId: latest.id,
        verificationQuality: latest.verificationQuality,
        evidenceObservedAt: latest.evidenceObservedAt,
        evidencePolicyVersion: latest.evidencePolicyVersion,
    }
}

export interface LatestVerificationOutcome {
    readonly resultId: string
    readonly verificationQuality: string
    readonly createdAt: Date
}

/** Backs the address cooldown check: the latest verification outcome for an address regardless of quality,
 *  gated by the same settlement-confirmed rule as the cache candidate query above. */
export async function queryLatestVerificationOutcome(
    manager: EntityManager,
    organizationId: string,
    normalizedAddress: string,
): Promise<LatestVerificationOutcome | null> {
    const latest = await manager.findOne(EmailVerificationEntity, {
        where: { organizationId, email: normalizedAddress },
        order: { createdAt: 'DESC' },
    })
    if (!latest) return null
    if (!(await isSettlementConfirmed(manager, latest.id))) return null

    return { resultId: latest.id, verificationQuality: latest.verificationQuality, createdAt: latest.createdAt }
}
