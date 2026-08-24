import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    Organization,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class MembershipRemovalService {
    constructor(private readonly dataSource: DataSource) {}

    async remove(actor: AuthPrincipal, organizationId: string, membershipId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may remove members')
        }

        // Deliberately no Keycloak call here: membership status is authoritative for product access
        // (ExecPlan 07's own Decision Log), so removing local access must not depend on any external call.
        await this.dataSource.transaction(async manager => {
            await manager.findOne(Organization, {
                where: { id: organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            const membership = await manager.findOne(OrganizationMembership, {
                where: { id: membershipId, organizationId },
            })
            if (!membership) {
                throw new NotFoundException('Membership not found')
            }
            if (membership.status === 'disabled') {
                return
            }

            if (actor.membershipRole === 'admin' && membership.role === 'owner') {
                throw new ForbiddenException('Admins cannot remove an owner')
            }

            if (membership.role === 'owner') {
                const activeOwnerCount = await manager.count(OrganizationMembership, {
                    where: { organizationId, role: 'owner', status: 'active' },
                })
                if (activeOwnerCount <= 1) {
                    throw new ConflictException('Cannot remove the final owner of an organization')
                }
            }

            membership.status = 'disabled'
            await manager.save(OrganizationMembership, membership)

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'membership.removed',
                targetType: 'membership',
                targetId: membership.id,
                outcome: 'success',
            })
        })
    }
}
