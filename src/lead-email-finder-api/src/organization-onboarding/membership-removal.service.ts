import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class MembershipRemovalService {
    constructor(
        @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
        private readonly dataSource: DataSource,
    ) {}

    async remove(actor: AuthPrincipal, organizationId: string, membershipId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may remove members')
        }

        const membership = await this.membershipRepo.findOneBy({ id: membershipId, organizationId })
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
            const activeOwnerCount = await this.membershipRepo.count({
                where: { organizationId, role: 'owner', status: 'active' },
            })
            if (activeOwnerCount <= 1) {
                throw new ConflictException('Cannot remove the final owner of an organization')
            }
        }

        // Deliberately no Keycloak call here: membership status is authoritative for product access
        // (ExecPlan 07's own Decision Log), so removing local access must not depend on any external call.
        await this.dataSource.transaction(async manager => {
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
