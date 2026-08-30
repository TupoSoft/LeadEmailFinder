import { AuthRole } from './auth-principal'
import { InvitationStatus } from './invitation-status'

export interface OrganizationInvitationRecord {
    readonly id: string
    readonly organizationId: string
    readonly email: string
    readonly role: AuthRole
    readonly status: InvitationStatus
    readonly expiresAt: Date
}
