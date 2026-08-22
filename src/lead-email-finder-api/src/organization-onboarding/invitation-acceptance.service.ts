import { ConflictException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import {
    AuditLogEntry,
    AuthRole,
    ExternalIdentity,
    HumanIdentityResolver,
    OrganizationInvitation,
    OrganizationMembership,
} from '@tuposoft/lead-email-finder/modules/identity'
import { hashInvitationToken } from './invitation-token'
import { KEYCLOAK_ORGANIZATION_ADMIN, KeycloakOrganizationAdmin, KeycloakUserRef } from './keycloak-organization-admin'

export interface InvitationAcceptanceResult {
    readonly organizationId: string
    readonly role: AuthRole
    readonly email: string
}

@Injectable()
export class InvitationAcceptanceService {
    constructor(
        @InjectRepository(OrganizationInvitation) private readonly invitationRepo: Repository<OrganizationInvitation>,
        private readonly dataSource: DataSource,
        private readonly humanIdentityResolver: HumanIdentityResolver,
        @Inject(KEYCLOAK_ORGANIZATION_ADMIN) private readonly keycloakAdmin: KeycloakOrganizationAdmin,
        private readonly configService: ConfigService,
    ) {}

    async accept(rawToken: string, password: string): Promise<InvitationAcceptanceResult> {
        const tokenHash = hashInvitationToken(rawToken)
        const invitation = await this.invitationRepo.findOne({ where: { tokenHash } })

        if (!invitation) {
            throw new NotFoundException('Invitation not found')
        }
        if (invitation.status === 'accepted') {
            return { organizationId: invitation.organizationId, role: invitation.role, email: invitation.email }
        }
        if (invitation.expiresAt.getTime() < Date.now()) {
            throw new GoneException('Invitation has expired')
        }

        const issuer = this.configService.getOrThrow<string>('OIDC_ISSUER_URL')

        let keycloakUser: KeycloakUserRef
        try {
            keycloakUser = await this.keycloakAdmin.ensureUser({ email: invitation.email, password })
        } catch (error) {
            await this.recordKeycloakFailure(invitation, issuer)
            throw error
        }

        return this.dataSource.transaction(async manager => {
            const externalIdentity = await this.humanIdentityResolver.resolveOrCreate(
                issuer,
                keycloakUser.subject,
                invitation.email,
                manager,
            )
            await manager.findOne(ExternalIdentity, {
                where: { id: externalIdentity.id },
                lock: { mode: 'pessimistic_write' },
            })

            const freshInvitation = await manager.findOneByOrFail(OrganizationInvitation, { id: invitation.id })
            if (freshInvitation.status === 'accepted') {
                return {
                    organizationId: freshInvitation.organizationId,
                    role: freshInvitation.role,
                    email: freshInvitation.email,
                }
            }

            const activeMembershipCount = await manager.count(OrganizationMembership, {
                where: { externalIdentityId: externalIdentity.id, status: 'active' },
            })
            if (activeMembershipCount > 0) {
                throw new ConflictException('This identity already holds an active organization membership')
            }

            if (invitation.role === 'owner' || invitation.role === 'admin') {
                try {
                    await this.keycloakAdmin.assignRealmRole(keycloakUser.subject, invitation.role)
                } catch (error) {
                    await this.recordKeycloakFailure(invitation, issuer)
                    throw error
                }
            }

            const updateResult = await manager.update(
                OrganizationInvitation,
                { id: invitation.id, status: 'pending' },
                { status: 'accepted', acceptedAt: new Date(), acceptedByExternalIdentityId: externalIdentity.id },
            )
            if (updateResult.affected === 0) {
                const winningInvitation = await manager.findOneByOrFail(OrganizationInvitation, { id: invitation.id })
                return {
                    organizationId: winningInvitation.organizationId,
                    role: winningInvitation.role,
                    email: winningInvitation.email,
                }
            }

            const membership = await manager.save(
                OrganizationMembership,
                manager.create(OrganizationMembership, {
                    organizationId: invitation.organizationId,
                    externalIdentityId: externalIdentity.id,
                    role: invitation.role,
                    status: 'active',
                }),
            )

            await manager.insert(AuditLogEntry, {
                organizationId: invitation.organizationId,
                actorCredentialKind: 'human_session',
                actorIssuer: issuer,
                actorSubject: keycloakUser.subject,
                actorCredentialId: externalIdentity.id,
                action: 'invitation.accepted',
                targetType: 'invitation',
                targetId: invitation.id,
                outcome: 'success',
                metadata: { role: invitation.role, membershipId: membership.id },
            })

            return { organizationId: invitation.organizationId, role: invitation.role, email: invitation.email }
        })
    }

    private async recordKeycloakFailure(invitation: OrganizationInvitation, issuer: string): Promise<void> {
        await this.invitationRepo.manager.insert(AuditLogEntry, {
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
