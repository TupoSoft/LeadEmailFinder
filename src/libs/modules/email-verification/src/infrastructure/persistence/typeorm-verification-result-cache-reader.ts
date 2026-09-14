import { EntityManager } from 'typeorm'
import {
    VerificationResultCacheCandidate,
    VerificationResultCacheReader,
} from '../../application/ports/verification-result-cache-reader'
import { CooldownCandidate, VerificationCooldownReader } from '../../application/ports/verification-cooldown-reader'
import { queryLatestCacheCandidate, queryLatestVerificationOutcome } from './verification-result-cache-query'

export class TypeOrmVerificationResultCacheReader implements VerificationResultCacheReader, VerificationCooldownReader {
    constructor(private readonly manager: EntityManager) {}

    findLatestCandidate(
        organizationId: string,
        normalizedAddress: string,
    ): Promise<VerificationResultCacheCandidate | null> {
        return queryLatestCacheCandidate(this.manager, organizationId, normalizedAddress)
    }

    findLatestOutcome(organizationId: string, normalizedAddress: string): Promise<CooldownCandidate | null> {
        return queryLatestVerificationOutcome(this.manager, organizationId, normalizedAddress)
    }
}
