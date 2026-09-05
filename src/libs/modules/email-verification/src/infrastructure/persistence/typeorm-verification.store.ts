import { Repository } from 'typeorm'
import { EmailVerification, NewEmailVerification } from '../../domain/email-verification'
import { VerificationStore } from '../../application/ports/verification-store'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'

function toRecord(entity: EmailVerificationEntity): EmailVerification {
    return {
        organizationId: entity.organizationId,
        id: entity.id,
        email: entity.email,
        domain: entity.domain,
        localPart: entity.localPart,
        format: entity.format,
        targetExchange: entity.targetExchange,
        mxDomain: entity.mxDomain,
        exists: entity.exists,
        catchAll: entity.catchAll,
        reason: entity.reason,
        sources: entity.sources,
        createdAt: entity.createdAt,
        batchId: entity.batchId,
    }
}

export class TypeOrmVerificationStore implements VerificationStore {
    constructor(private readonly repository: Repository<EmailVerificationEntity>) {}

    async create(organizationId: string, record: NewEmailVerification): Promise<EmailVerification> {
        const saved = await this.repository.save(this.repository.create({ organizationId, ...record }))
        return toRecord(saved)
    }
}
