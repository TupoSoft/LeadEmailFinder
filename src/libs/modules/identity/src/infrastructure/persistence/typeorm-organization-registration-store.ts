import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    CreateOrganizationWithOwnerInvitationCommand,
    OrganizationRegistrationResult,
    OrganizationRegistrationStore,
} from '../../application/ports/organization-registration-store'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { OrganizationRecord } from '../../domain/organization-record'
import { AuditLogEntry } from './audit-log-entry.entity'
import { Organization } from './organization.entity'
import { OrganizationInvitation } from './organization-invitation.entity'

@Injectable()
export class TypeOrmOrganizationRegistrationStore implements OrganizationRegistrationStore {
    constructor(private readonly dataSource: DataSource) {}

    async createWithOwnerInvitation(
        command: CreateOrganizationWithOwnerInvitationCommand,
    ): Promise<OrganizationRegistrationResult> {
        const { name, ownerEmail, tokenHash, expiresAt, actor } = command

        return this.dataSource.transaction(async manager => {
            const organization = await manager.save(Organization, manager.create(Organization, { name }))
            const invitation = await manager.save(
                OrganizationInvitation,
                manager.create(OrganizationInvitation, {
                    organizationId: organization.id,
                    email: ownerEmail,
                    role: 'owner',
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
                organizationId: organization.id,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'organization.created',
                targetType: 'organization',
                targetId: organization.id,
                outcome: 'success',
            })
            await manager.insert(AuditLogEntry, {
                organizationId: organization.id,
                actorCredentialKind: actor.credentialKind,
                actorIssuer: actor.issuer,
                actorSubject: actor.subject,
                actorCredentialId: actor.credentialId,
                action: 'invitation.issued',
                targetType: 'invitation',
                targetId: invitation.id,
                outcome: 'success',
                metadata: { role: 'owner', email: ownerEmail },
            })

            return { organization: toOrganizationRecord(organization), invitation: toInvitationRecord(invitation) }
        })
    }
}

function toOrganizationRecord(organization: Organization): OrganizationRecord {
    return { id: organization.id, name: organization.name }
}

function toInvitationRecord(invitation: OrganizationInvitation): OrganizationInvitationRecord {
    return {
        id: invitation.id,
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
    }
}
