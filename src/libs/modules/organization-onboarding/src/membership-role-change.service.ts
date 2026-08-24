import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    AuthRole,
    Organization,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'
import { KEYCLOAK_ORGANIZATION_ADMIN, KeycloakOrganizationAdmin } from './keycloak-organization-admin'

@Injectable()
export class MembershipRoleChangeService {
    constructor(
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

        return this.dataSource.transaction(async manager => {
            await manager.findOne(Organization, {
                where: { id: organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            const membership = await manager.findOne(OrganizationMembership, {
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
                const activeOwnerCount = await manager.count(OrganizationMembership, {
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
