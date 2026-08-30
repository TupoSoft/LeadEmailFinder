import { AuthPrincipal, AuthRole } from '../../domain/auth-principal'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'

export const INVITATION_STORE = Symbol('INVITATION_STORE')

export interface IssueInvitationCommand {
    readonly organizationId: string
    /** Already normalized (lowercased) by the caller. */
    readonly email: string
    readonly role: AuthRole
    readonly tokenHash: string
    readonly expiresAt: Date
    readonly actor: AuthPrincipal
}

export interface InvitationStore {
    /** Atomically creates the pending invitation and its audit row. */
    issueWithAudit(command: IssueInvitationCommand): Promise<OrganizationInvitationRecord>

    findByTokenHash(tokenHash: string): Promise<OrganizationInvitationRecord | undefined>

    /**
     * Non-transactional failure audit append, matching today's `actorSubject: invitation.email` even when a
     * Keycloak subject already exists (the realm-role-assignment failure path) — a preexisting quirk to
     * preserve, not fix.
     */
    recordAcceptanceFailure(invitation: OrganizationInvitationRecord, issuer: string): Promise<void>
}
