import { OrganizationMembershipDetailRecord } from '../../domain/organization-membership-detail-record'

export const MEMBERSHIP_DIRECTORY = Symbol('MEMBERSHIP_DIRECTORY')

export interface MembershipDirectory {
    /** Does not filter by status: the caller decides what "active" means, same as today's query. */
    listForOrganization(organizationId: string): Promise<readonly OrganizationMembershipDetailRecord[]>
}
