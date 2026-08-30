import { ActiveMembershipReader, OrganizationMembershipRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'

export class SingleActiveMembershipRequiredError extends Error {
    constructor() {
        super('Sign-in requires exactly one active organization membership')
        this.name = 'SingleActiveMembershipRequiredError'
    }
}

export class HumanMembershipResolver {
    constructor(private readonly activeMembershipReader: ActiveMembershipReader) {}

    async resolveActive(organizationId: string, externalIdentityId: string): Promise<OrganizationMembershipRecord> {
        const membership = await this.activeMembershipReader.findByOrganizationAndExternalIdentity(
            organizationId,
            externalIdentityId,
        )

        if (!membership || membership.status !== 'active') {
            throw new CredentialRejectedError('Organization membership is unknown or disabled')
        }

        return membership
    }

    async resolveActiveForLogin(externalIdentityId: string): Promise<OrganizationMembershipRecord> {
        const memberships = await this.activeMembershipReader.findActiveForExternalIdentity(externalIdentityId)

        if (memberships.length !== 1) {
            throw new SingleActiveMembershipRequiredError()
        }

        return memberships[0]
    }
}
