import { ForbiddenException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, AuthRole, OrganizationInvitation } from '@tuposoft/lead-email-finder/modules/identity'
import { generateInvitationToken, INVITATION_TTL_MS } from './invitation-token'

export interface InvitationIssuanceResult {
    readonly invitation: OrganizationInvitation
    readonly rawToken: string
}

@Injectable()
export class InvitationIssuanceService {
    constructor(private readonly dataSource: DataSource) {}

    async issue(
        actor: AuthPrincipal,
        organizationId: string,
        email: string,
        role: AuthRole,
    ): Promise<InvitationIssuanceResult> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may invite members')
        }
        if (actor.membershipRole === 'admin' && role === 'owner') {
            throw new ForbiddenException('Admins cannot grant the owner role')
        }

        const { rawToken, tokenHash } = generateInvitationToken()
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
        const normalizedEmail = email.toLowerCase()

        const invitation = await this.dataSource.transaction(async manager => {
            const invitation = await manager.save(
                OrganizationInvitation,
                manager.create(OrganizationInvitation, {
                    organizationId,
                    email: normalizedEmail,
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
                metadata: { role, email: normalizedEmail },
            })

            return invitation
        })

        return { invitation, rawToken }
    }
}
