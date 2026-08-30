import { AuthRole } from './auth-principal'
import { MembershipStatus } from './membership-status'

export interface OrganizationMembershipRecord {
    readonly id: string
    readonly organizationId: string
    readonly externalIdentityId: string
    readonly role: AuthRole
    readonly status: MembershipStatus
}
