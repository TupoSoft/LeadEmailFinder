import {
    InvitationAcceptanceResult,
    InvitationAcceptanceStore,
    InvitationStore,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ConflictingMembershipError, InvitationExpiredError, InvitationNotFoundError } from '../domain/organization-onboarding.errors'
import { hashInvitationToken } from '../domain/invitation-token'
import { KeycloakOrganizationAdmin, KeycloakUserRef } from './ports/keycloak-organization-admin'

export class InvitationAcceptanceService {
    constructor(
        private readonly invitationStore: InvitationStore,
        private readonly acceptanceStore: InvitationAcceptanceStore,
        private readonly keycloakAdmin: KeycloakOrganizationAdmin,
        private readonly issuer: string,
    ) {}

    async accept(rawToken: string, password: string): Promise<InvitationAcceptanceResult> {
        const tokenHash = hashInvitationToken(rawToken)
        const invitation = await this.invitationStore.findByTokenHash(tokenHash)

        if (!invitation) {
            throw new InvitationNotFoundError()
        }
        if (invitation.status === 'accepted') {
            return { organizationId: invitation.organizationId, role: invitation.role, email: invitation.email }
        }
        if (invitation.expiresAt.getTime() < Date.now()) {
            throw new InvitationExpiredError()
        }

        let keycloakUser: KeycloakUserRef
        try {
            keycloakUser = await this.keycloakAdmin.ensureUser({ email: invitation.email, password })
        } catch (error) {
            await this.invitationStore.recordAcceptanceFailure(invitation, this.issuer)
            throw error
        }

        const begun = await this.acceptanceStore.begin(invitation, this.issuer, keycloakUser.subject)
        if (begun.kind === 'already-accepted') {
            return begun.result
        }
        if (begun.kind === 'conflicting-membership') {
            throw new ConflictingMembershipError()
        }

        const session = begun.session
        let result: InvitationAcceptanceResult | undefined
        try {
            if (invitation.role === 'owner' || invitation.role === 'admin') {
                try {
                    await this.keycloakAdmin.assignRealmRole(keycloakUser.subject, invitation.role)
                } catch (error) {
                    await this.invitationStore.recordAcceptanceFailure(invitation, this.issuer)
                    throw error
                }
            }
            result = await session.complete()
            return result
        } finally {
            if (result === undefined) {
                await session.abort()
            }
        }
    }
}
