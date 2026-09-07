import { AuthRole } from '../../domain/auth-principal'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'

export const INVITATION_ACCEPTANCE_STORE = Symbol('INVITATION_ACCEPTANCE_STORE')

export type InvitationAcceptanceResult = InvitationAcceptanceCreatedResult | { readonly status: 'accepted' }

export interface InvitationAcceptanceCreatedResult {
    readonly organizationId: string
    readonly role: AuthRole
    readonly email: string
}

/**
 * Holds one open, locked transaction across the caller's Keycloak call. The caller must call exactly one of
 * `complete()`/`abort()`; both are no-ops on a second call so a defensive `finally` never double-settles.
 */
export interface InvitationAcceptanceSession {
    /**
     * Marks the invitation accepted (or, if a concurrent acceptance already won, returns only generic accepted status
     * without writing again), creates the membership, writes the success audit row, and commits.
     */
    complete(): Promise<InvitationAcceptanceResult>

    /** Rolls back and releases the connection/lock without recording anything. */
    abort(): Promise<void>
}

export type InvitationAcceptanceBeginOutcome =
    | { readonly kind: 'already-accepted'; readonly result: { readonly status: 'accepted' } }
    | { readonly kind: 'conflicting-membership' }
    | { readonly kind: 'ready'; readonly session: InvitationAcceptanceSession }

export interface InvitationAcceptanceStore {
    /**
     * Resolves-or-creates and locks the external identity for (issuer, keycloakSubject), rechecks the
     * invitation's status, and checks for a conflicting active membership — all inside one open transaction
     * that the caller must complete()/abort().
     */
    begin(
        invitation: OrganizationInvitationRecord,
        issuer: string,
        keycloakSubject: string,
    ): Promise<InvitationAcceptanceBeginOutcome>
}
