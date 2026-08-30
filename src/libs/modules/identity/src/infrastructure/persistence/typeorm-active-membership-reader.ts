import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ActiveMembershipReader } from '../../application/ports/active-membership-reader'
import { OrganizationMembershipRecord } from '../../domain/organization-membership-record'
import { OrganizationMembership } from './membership.entity'

@Injectable()
export class TypeOrmActiveMembershipReader implements ActiveMembershipReader {
    constructor(
        @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    ) {}

    async findByOrganizationAndExternalIdentity(
        organizationId: string,
        externalIdentityId: string,
    ): Promise<OrganizationMembershipRecord | undefined> {
        const entity = await this.membershipRepo.findOne({ where: { organizationId, externalIdentityId } })
        return entity ? toRecord(entity) : undefined
    }

    async findActiveForExternalIdentity(externalIdentityId: string): Promise<readonly OrganizationMembershipRecord[]> {
        const entities = await this.membershipRepo.find({ where: { externalIdentityId, status: 'active' } })
        return entities.map(toRecord)
    }
}

function toRecord(entity: OrganizationMembership): OrganizationMembershipRecord {
    return {
        id: entity.id,
        organizationId: entity.organizationId,
        externalIdentityId: entity.externalIdentityId,
        role: entity.role,
        status: entity.status,
    }
}
