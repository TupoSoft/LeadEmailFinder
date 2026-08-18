import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, AuthRole, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
import { KEYCLOAK_ORGANIZATION_ADMIN, KeycloakOrganizationAdmin } from './keycloak-organization-admin'

@Injectable()
export class MembershipRoleChangeService {
    constructor(
        @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
        private readonly dataSource: DataSource,
        @Inject(KEYCLOAK_ORGANIZATION_ADMIN) private readonly keycloakAdmin: KeycloakOrganizationAdmin,
    ) {}

    async changeRole(
        actor: AuthPrincipal,
        organizationId: string,
        membershipId: string,
        newRole: AuthRole,
    ): Promise<OrganizationMembership> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may change member roles')
        }

        const membership = await this.membershipRepo.findOne({
            where: { id: membershipId, organizationId },
            relations: ['externalIdentity'],
        })
        if (!membership) {
            throw new NotFoundException('Membership not found')
        }

        if (actor.membershipRole === 'admin' && (newRole === 'owner' || membership.role === 'owner')) {
            throw new ForbiddenException('Admins cannot grant or modify the owner role')
        }

        if (membership.role === 'owner' && newRole !== 'owner') {
            const activeOwnerCount = await this.membershipRepo.count({
                where: { organizationId, role: 'owner', status: 'active' },
            })
            if (activeOwnerCount <= 1) {
                throw new ConflictException('Cannot demote the final owner of an organization')
            }
        }

        if (newRole === 'owner' || newRole === 'admin') {
            await this.keycloakAdmin.assignRealmRole(membership.externalIdentity.subject, newRole)
        }

        const previousRole = membership.role

        return this.dataSource.transaction(async manager => {
            membership.role = newRole
            const saved = await manager.save(OrganizationMembership, membership)

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'membership.role_changed',
                targetType: 'membership',
                targetId: membership.id,
                outcome: 'success',
                metadata: { fromRole: previousRole, toRole: newRole },
            })

            return saved
        })
    }
}
