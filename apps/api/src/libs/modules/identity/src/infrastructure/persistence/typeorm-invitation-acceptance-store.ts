import { Injectable } from '@nestjs/common'
import { DataSource, QueryRunner } from 'typeorm'
import {
    InvitationAcceptanceBeginOutcome,
    InvitationAcceptanceResult,
    InvitationAcceptanceSession,
    InvitationAcceptanceStore,
} from '../../application/ports/invitation-acceptance-store'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { ExternalIdentity } from './external-identity.entity'
import { OrganizationMembership } from './membership.entity'
import { OrganizationInvitation } from './organization-invitation.entity'

const POSTGRES_UNIQUE_VIOLATION = '23505'

@Injectable()
export class TypeOrmInvitationAcceptanceStore implements InvitationAcceptanceStore {
    constructor(private readonly dataSource: DataSource) {}

    async begin(
        invitation: OrganizationInvitationRecord,
        issuer: string,
        keycloakSubject: string,
    ): Promise<InvitationAcceptanceBeginOutcome> {
        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const manager = queryRunner.manager
            const externalIdentityRepo = manager.getRepository(ExternalIdentity)

            let externalIdentity = await externalIdentityRepo.findOne({
                where: { issuer, subject: keycloakSubject },
            })
            if (externalIdentity) {
                if (externalIdentity.email !== invitation.email) {
                    externalIdentity = await externalIdentityRepo.save({
                        ...externalIdentity,
                        email: invitation.email,
                    })
                }
            } else {
                try {
                    externalIdentity = await externalIdentityRepo.save(
                        externalIdentityRepo.create({ issuer, subject: keycloakSubject, email: invitation.email }),
                    )
                } catch (error) {
                    if (!isUniqueViolation(error)) throw error
                    const raced = await externalIdentityRepo.findOne({ where: { issuer, subject: keycloakSubject } })
                    if (!raced) throw error
                    externalIdentity = raced
                }
            }

            await manager.findOne(ExternalIdentity, {
                where: { id: externalIdentity.id },
                lock: { mode: 'pessimistic_write' },
            })

            const freshInvitation = await manager.findOneByOrFail(OrganizationInvitation, { id: invitation.id })
            if (freshInvitation.status === 'accepted') {
                await queryRunner.commitTransaction()
                await queryRunner.release()
                return { kind: 'already-accepted', result: { status: 'accepted' } }
            }

            const activeMembershipCount = await manager.count(OrganizationMembership, {
                where: { externalIdentityId: externalIdentity.id, status: 'active' },
            })
            if (activeMembershipCount > 0) {
                await queryRunner.rollbackTransaction()
                await queryRunner.release()
                return { kind: 'conflicting-membership' }
            }

            return {
                kind: 'ready',
                session: new TypeOrmInvitationAcceptanceSession(
                    queryRunner,
                    invitation,
                    externalIdentity.id,
                    keycloakSubject,
                    issuer,
                ),
            }
        } catch (error) {
            await queryRunner.rollbackTransaction().catch(() => undefined)
            await queryRunner.release()
            throw error
        }
    }
}

class TypeOrmInvitationAcceptanceSession implements InvitationAcceptanceSession {
    private settled = false

    constructor(
        private readonly queryRunner: QueryRunner,
        private readonly invitation: OrganizationInvitationRecord,
        private readonly externalIdentityId: string,
        private readonly keycloakSubject: string,
        private readonly issuer: string,
    ) {}

    async complete(): Promise<InvitationAcceptanceResult> {
        if (this.settled) throw new Error('Invitation acceptance session already settled')
        this.settled = true

        const manager = this.queryRunner.manager
        try {
            const updateResult = await manager.update(
                OrganizationInvitation,
                { id: this.invitation.id, status: 'pending' },
                { status: 'accepted', acceptedAt: new Date(), acceptedByExternalIdentityId: this.externalIdentityId },
            )
            if (updateResult.affected === 0) {
                await manager.findOneByOrFail(OrganizationInvitation, { id: this.invitation.id })
                await this.queryRunner.commitTransaction()
                return { status: 'accepted' }
            }

            const membership = await manager.save(
                OrganizationMembership,
                manager.create(OrganizationMembership, {
                    organizationId: this.invitation.organizationId,
                    externalIdentityId: this.externalIdentityId,
                    role: this.invitation.role,
                    status: 'active',
                }),
            )

            await manager.insert(AuditLogEntry, {
                organizationId: this.invitation.organizationId,
                actorCredentialKind: 'human_session',
                actorIssuer: this.issuer,
                actorSubject: this.keycloakSubject,
                actorCredentialId: this.externalIdentityId,
                action: 'invitation.accepted',
                targetType: 'invitation',
                targetId: this.invitation.id,
                outcome: 'success',
                metadata: { role: this.invitation.role, membershipId: membership.id },
            })

            await this.queryRunner.commitTransaction()
            return {
                organizationId: this.invitation.organizationId,
                role: this.invitation.role,
                email: this.invitation.email,
            }
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

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    )
}
