import { Injectable } from '@nestjs/common'
import { DataSource, QueryRunner } from 'typeorm'
import { AuthPrincipal, AuthRole } from '../../domain/auth-principal'
import { OrganizationMembershipDetailRecord } from '../../domain/organization-membership-detail-record'
import {
    MembershipMutationBeginOutcome,
    MembershipMutationSession,
    MembershipMutationStore,
} from '../../application/ports/membership-mutation-store'
import { AuditLogEntry } from './audit-log-entry.entity'
import { OrganizationMembership } from './membership.entity'
import { Organization } from './organization.entity'

@Injectable()
export class TypeOrmMembershipMutationStore implements MembershipMutationStore {
    constructor(private readonly dataSource: DataSource) {}

    async begin(organizationId: string, membershipId: string): Promise<MembershipMutationBeginOutcome> {
        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const manager = queryRunner.manager

            await manager.findOne(Organization, {
                where: { id: organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            const membership = await manager.findOne(OrganizationMembership, {
                where: { id: membershipId, organizationId },
                relations: ['externalIdentity'],
            })
            if (!membership) {
                await queryRunner.rollbackTransaction()
                await queryRunner.release()
                return { kind: 'not-found' }
            }

            const activeOwnerCount = await manager.count(OrganizationMembership, {
                where: { organizationId, role: 'owner', status: 'active' },
            })

            return {
                kind: 'ready',
                context: { membership: toRecord(membership), activeOwnerCount },
                session: new TypeOrmMembershipMutationSession(queryRunner, organizationId, membershipId),
            }
        } catch (error) {
            await queryRunner.rollbackTransaction().catch(() => undefined)
            await queryRunner.release()
            throw error
        }
    }
}

class TypeOrmMembershipMutationSession implements MembershipMutationSession {
    private settled = false

    constructor(
        private readonly queryRunner: QueryRunner,
        private readonly organizationId: string,
        private readonly membershipId: string,
    ) {}

    async changeRole(newRole: AuthRole, actor: AuthPrincipal): Promise<OrganizationMembershipDetailRecord> {
        if (this.settled) throw new Error('Membership mutation session already settled')
        this.settled = true

        const manager = this.queryRunner.manager
        try {
            const membership = await manager.findOneOrFail(OrganizationMembership, {
                where: { id: this.membershipId, organizationId: this.organizationId },
                relations: ['externalIdentity'],
            })
            const previousRole = membership.role
            membership.role = newRole
            const saved = await manager.save(OrganizationMembership, membership)

            await manager.insert(AuditLogEntry, {
                organizationId: this.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'membership.role_changed',
                targetType: 'membership',
                targetId: saved.id,
                outcome: 'success',
                metadata: { fromRole: previousRole, toRole: newRole },
            })

            await this.queryRunner.commitTransaction()
            return toRecord(saved)
        } finally {
            await this.queryRunner.release()
        }
    }

    async disable(actor: AuthPrincipal): Promise<void> {
        if (this.settled) throw new Error('Membership mutation session already settled')
        this.settled = true

        const manager = this.queryRunner.manager
        try {
            const membership = await manager.findOneByOrFail(OrganizationMembership, {
                id: this.membershipId,
                organizationId: this.organizationId,
            })
            membership.status = 'disabled'
            await manager.save(OrganizationMembership, membership)

            await manager.insert(AuditLogEntry, {
                organizationId: this.organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'membership.removed',
                targetType: 'membership',
                targetId: membership.id,
                outcome: 'success',
            })

            await this.queryRunner.commitTransaction()
        } finally {
            await this.queryRunner.release()
        }
    }

    async abort(): Promise<void> {
        if (this.settled) return
        this.settled = true
        await this.queryRunner.rollbackTransaction()
        await this.queryRunner.release()
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
