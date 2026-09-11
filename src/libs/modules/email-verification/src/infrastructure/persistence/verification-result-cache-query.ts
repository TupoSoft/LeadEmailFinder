import { EntityManager, In } from 'typeorm'
import { VerificationResultCacheCandidate } from '../../application/ports/verification-result-cache-reader'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'

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

    return {
        resultId: latest.id,
        verificationQuality: latest.verificationQuality,
        evidenceObservedAt: latest.evidenceObservedAt,
        evidencePolicyVersion: latest.evidencePolicyVersion,
    }
}
