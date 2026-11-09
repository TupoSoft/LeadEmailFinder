import { Repository } from 'typeorm'
import { SmtpVerification } from '../../domain/smtp-verification'
import { SmtpVerificationStore, SmtpVerificationUpdate } from '../../application/ports/smtp-verification-store'
import { SmtpVerificationEntity } from './typeorm/smtp-verification.entity'

function toRecord(entity: SmtpVerificationEntity): SmtpVerification {
    return {
        organizationId: entity.organizationId,
        id: entity.id,
        reason: entity.reason,
        exists: entity.exists,
        secureTransport: entity.secureTransport,
        targetExchange: entity.targetExchange,
        proxyId: entity.proxyId,
        evidenceObservedAt: entity.evidenceObservedAt,
        evidencePolicyVersion: entity.evidencePolicyVersion,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}

export class TypeOrmSmtpVerificationStore implements SmtpVerificationStore {
    constructor(private readonly repository: Repository<SmtpVerificationEntity>) {}

    async findByAddress(organizationId: string, address: string): Promise<SmtpVerification | null> {
        const entity = await this.repository.findOneBy({ organizationId, id: address })
        return entity === null ? null : toRecord(entity)
    }

    async upsert(organizationId: string, address: string, changes: SmtpVerificationUpdate): Promise<SmtpVerification> {
        let entity = await this.repository.findOneBy({ organizationId, id: address })
        entity ??= this.repository.create({ organizationId, id: address })
        Object.assign(entity, changes)
        return toRecord(await this.repository.save(entity))
    }
}
