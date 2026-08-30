import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { InvitationStore, IssueInvitationCommand } from '../../application/ports/invitation-store'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { OrganizationInvitation } from './organization-invitation.entity'

@Injectable()
export class TypeOrmInvitationStore implements InvitationStore {
    constructor(private readonly dataSource: DataSource) {}

    async issueWithAudit(command: IssueInvitationCommand): Promise<OrganizationInvitationRecord> {
        const { organizationId, email, role, tokenHash, expiresAt, actor } = command

        const invitation = await this.dataSource.transaction(async manager => {
            const invitation = await manager.save(
                OrganizationInvitation,
                manager.create(OrganizationInvitation, {
                    organizationId,
                    email,
                    role,
                    tokenHash,
                    expiresAt,
                    status: 'pending',
                    invitedByCredentialKind: actor.credentialKind,
                    invitedByIssuer: actor.issuer,
                    invitedBySubject: actor.subject,
                    invitedByCredentialId: actor.credentialId,
                }),
            )

            await manager.insert(AuditLogEntry, {
                organizationId,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'invitation.issued',
                targetType: 'invitation',
                targetId: invitation.id,
                outcome: 'success',
                metadata: { role, email },
            })

            return invitation
        })

        return toRecord(invitation)
    }

    async findByTokenHash(tokenHash: string): Promise<OrganizationInvitationRecord | undefined> {
        const invitation = await this.dataSource.manager.findOne(OrganizationInvitation, { where: { tokenHash } })
        return invitation ? toRecord(invitation) : undefined
    }

    async recordAcceptanceFailure(invitation: OrganizationInvitationRecord, issuer: string): Promise<void> {
        await this.dataSource.manager.insert(AuditLogEntry, {
            organizationId: invitation.organizationId,
            actorCredentialKind: 'human_session',
            actorIssuer: issuer,
            actorSubject: invitation.email,
            actorCredentialId: invitation.id,
            action: 'invitation.accept_failed',
            targetType: 'invitation',
            targetId: invitation.id,
            outcome: 'failure',
            metadata: { reason: 'keycloak_call_failed' },
        })
    }
}

function toRecord(invitation: OrganizationInvitation): OrganizationInvitationRecord {
    return {
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
    }
}
