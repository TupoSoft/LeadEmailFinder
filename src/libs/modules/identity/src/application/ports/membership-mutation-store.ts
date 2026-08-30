import { AuthPrincipal, AuthRole } from '../../domain/auth-principal'
import { OrganizationMembershipDetailRecord } from '../../domain/organization-membership-detail-record'

export const MEMBERSHIP_MUTATION_STORE = Symbol('MEMBERSHIP_MUTATION_STORE')

export interface MembershipMutationContext {
    readonly membership: OrganizationMembershipDetailRecord
    readonly activeOwnerCount: number
}

/**
 * Holds one open, locked transaction across the caller's business-rule decision and (for a role change) its
 * Keycloak call. The caller must call exactly one of `changeRole()`/`disable()`/`abort()`.
 */
export interface MembershipMutationSession {
    changeRole(newRole: AuthRole, actor: AuthPrincipal): Promise<OrganizationMembershipDetailRecord>
    disable(actor: AuthPrincipal): Promise<void>
    /** Rolls back and releases the connection/lock without recording anything. */
    abort(): Promise<void>
}

export type MembershipMutationBeginOutcome =
    | { readonly kind: 'not-found' }
    | { readonly kind: 'ready'; readonly context: MembershipMutationContext; readonly session: MembershipMutationSession }

export interface MembershipMutationStore {
    /** Locks the organization row (no existence check, matching today) and loads the membership, if any. */
    begin(organizationId: string, membershipId: string): Promise<MembershipMutationBeginOutcome>
}
