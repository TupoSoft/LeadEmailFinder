import {
    AuthPrincipal,
    MembershipDirectory,
    OrganizationMembershipDetailRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, NotInOrganizationError } from '../domain/organization-onboarding.errors'

export class MembershipListingService {
    constructor(private readonly directory: MembershipDirectory) {}

    async listForOrganization(actor: AuthPrincipal, organizationId: string): Promise<readonly OrganizationMembershipDetailRecord[]> {
        if (actor.organizationId !== organizationId) {
            throw new NotInOrganizationError()
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new InsufficientPermissionError('Only an owner or admin may list members')
        }

        return this.directory.listForOrganization(organizationId)
    }
}
