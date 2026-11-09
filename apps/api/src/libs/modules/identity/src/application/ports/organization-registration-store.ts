import { AuthPrincipal } from '../../domain/auth-principal'
import { OrganizationInvitationRecord } from '../../domain/organization-invitation-record'
import { OrganizationRecord } from '../../domain/organization-record'

export const ORGANIZATION_REGISTRATION_STORE = Symbol('ORGANIZATION_REGISTRATION_STORE')

export interface CreateOrganizationWithOwnerInvitationCommand {
    readonly name: string
    /** Already normalized (lowercased) by the caller. */
    readonly ownerEmail: string
    readonly tokenHash: string
    readonly expiresAt: Date
    readonly actor: AuthPrincipal
}

export interface OrganizationRegistrationResult {
    readonly organization: OrganizationRecord
    readonly invitation: OrganizationInvitationRecord
}

export interface OrganizationRegistrationStore {
    /** Atomically creates the organization, its pending owner invitation, and both audit rows. */
    createWithOwnerInvitation(
        command: CreateOrganizationWithOwnerInvitationCommand,
    ): Promise<OrganizationRegistrationResult>
}
