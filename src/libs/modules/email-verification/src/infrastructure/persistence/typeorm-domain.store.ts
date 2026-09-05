import { Repository } from 'typeorm'
import { DomainPolicy } from '../../domain/domain-policy'
import { DomainStore } from '../../application/ports/domain-store'
import { DomainPolicyEntity } from './typeorm/domain-policy.entity'

function toRecord(entity: DomainPolicyEntity): DomainPolicy {
    return {
        name: entity.id,
        isVerificationForbidden: entity.isVerificationForbidden,
        catchAllEnabled: entity.catchAllEnabled,
        isFree: entity.isFree,
        isDisposable: entity.isDisposable,
        mxRecords: entity.mxRecords,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}

export class TypeOrmDomainStore implements DomainStore {
    constructor(private readonly repository: Repository<DomainPolicyEntity>) {}

    async findByName(name: string): Promise<DomainPolicy | null> {
        const entity = await this.repository.findOneBy({ id: name })
        return entity === null ? null : toRecord(entity)
    }
}
