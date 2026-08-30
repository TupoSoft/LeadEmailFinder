import { OrganizationMembershipRecord } from '../../domain/organization-membership-record'

export const ACTIVE_MEMBERSHIP_READER = Symbol('ACTIVE_MEMBERSHIP_READER')

/**
 * Read-only membership lookups. Neither method filters or asserts on `status`: `findByOrganizationAndExternalIdentity`
 * returns whatever membership exists regardless of status, and `findActiveForExternalIdentity`'s `active` filter is
 * a query predicate, not an assertion. Deciding what "not found" or "not active" means for a caller is that
 * caller's business logic, not this port's.
 */
export interface ActiveMembershipReader {
    findByOrganizationAndExternalIdentity(
        organizationId: string,
        externalIdentityId: string,
    ): Promise<OrganizationMembershipRecord | undefined>

    findActiveForExternalIdentity(externalIdentityId: string): Promise<readonly OrganizationMembershipRecord[]>
}
