import { AuthRole } from './auth-principal'
import { MembershipStatus } from './membership-status'

export interface OrganizationMembershipDetailRecord {
    readonly id: string
    readonly organizationId: string
    readonly externalIdentityId: string
    readonly externalIdentitySubject: string
    readonly email: string | null
    readonly role: AuthRole
    readonly status: MembershipStatus
}
