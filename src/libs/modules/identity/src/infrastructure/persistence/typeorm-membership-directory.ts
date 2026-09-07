import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { MembershipDirectory } from '../../application/ports/membership-directory'
import { OrganizationMembershipDetailRecord } from '../../domain/organization-membership-detail-record'
import { OrganizationMembership } from './membership.entity'

@Injectable()
export class TypeOrmMembershipDirectory implements MembershipDirectory {
    constructor(private readonly dataSource: DataSource) {}

    async listForOrganization(organizationId: string): Promise<readonly OrganizationMembershipDetailRecord[]> {
        const memberships = await this.dataSource.manager.find(OrganizationMembership, {
            where: { organizationId },
            relations: ['externalIdentity'],
            order: { createdAt: 'ASC', id: 'ASC' },
        })

        return memberships.map(toRecord)
    }
}

function toRecord(membership: OrganizationMembership): OrganizationMembershipDetailRecord {
    return {
        id: membership.id,
        organizationId: membership.organizationId,
        externalIdentityId: membership.externalIdentityId,
        externalIdentitySubject: membership.externalIdentity.subject,
        email: membership.externalIdentity.email,
        role: membership.role,
        status: membership.status,
    }
}
