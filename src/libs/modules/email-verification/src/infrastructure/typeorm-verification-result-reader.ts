import { EntityManager } from 'typeorm'
import { VerificationResultDetail, VerificationResultLookup, VerificationResultReader } from '../application/verification-result-reader'
import { EmailVerificationEntity } from './persistence/typeorm/email-verification.entity'
import { VerificationSettlementIntentionEntity } from './persistence/typeorm/verification-settlement-intention.entity'

export class TypeOrmVerificationResultReader implements VerificationResultReader {
    constructor(private readonly manager: Pick<EntityManager, 'findOneBy'>) {}

    async findOwned({ id, organizationId }: VerificationResultLookup): Promise<VerificationResultDetail | null> {
        const result = await this.manager.findOneBy(EmailVerificationEntity, { id, organizationId })
        if (!result) return null

        const intention = await this.manager.findOneBy(VerificationSettlementIntentionEntity, { resultId: id })
        if (intention && intention.state !== 'confirmed') return null

        return {
            id: result.id,
            email: result.email,
            domain: result.domain,
            localPart: result.localPart,
            format: result.format,
            mxDomain: result.mxDomain,
            targetExchange: result.targetExchange,
            sources: result.sources,
            exists: result.exists,
            catchAll: result.catchAll,
            reason: result.reason,
            createdAt: result.createdAt,
            evidenceObservedAt: result.evidenceObservedAt,
        }
    }
}
