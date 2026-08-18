import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    AuditLogEntry,
    AuthPrincipal,
    Organization,
    OrganizationInvitation,
} from '@tuposoft/lead-email-finder/modules/identity'
import { generateInvitationToken, INVITATION_TTL_MS } from './invitation-token'

export interface OrganizationCreationResult {
    readonly organization: Organization
    readonly invitation: OrganizationInvitation
    readonly rawToken: string
}

@Injectable()
export class OrganizationCreationService {
    constructor(private readonly dataSource: DataSource) {}

    async createWithFirstOwner(
        actor: AuthPrincipal,
        name: string,
        ownerEmail: string,
    ): Promise<OrganizationCreationResult> {
        const { rawToken, tokenHash } = generateInvitationToken()
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        const email = ownerEmail.toLowerCase()

        const { organization, invitation } = await this.dataSource.transaction(async manager => {
            const organization = await manager.save(Organization, manager.create(Organization, { name }))
            const invitation = await manager.save(
                OrganizationInvitation,
                manager.create(OrganizationInvitation, {
                    organizationId: organization.id,
                    email,
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
                metadata: { role: 'owner', email },
            })

            return { organization, invitation }
        })

        return { organization, invitation, rawToken }
    }
}
