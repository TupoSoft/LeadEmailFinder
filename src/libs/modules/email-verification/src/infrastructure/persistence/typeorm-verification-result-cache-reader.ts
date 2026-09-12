import { EntityManager } from 'typeorm'
import {
    VerificationResultCacheCandidate,
    VerificationResultCacheReader,
} from '../../application/ports/verification-result-cache-reader'
import { queryLatestCacheCandidate } from './verification-result-cache-query'

export class TypeOrmVerificationResultCacheReader implements VerificationResultCacheReader {
    constructor(private readonly manager: EntityManager) {}

    findLatestCandidate(
        organizationId: string,
        normalizedAddress: string,
    ): Promise<VerificationResultCacheCandidate | null> {
        return queryLatestCacheCandidate(this.manager, organizationId, normalizedAddress)
    }
}
