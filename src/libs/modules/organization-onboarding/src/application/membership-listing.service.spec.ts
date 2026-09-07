import { AuthPrincipal, MembershipDirectory, OrganizationMembershipDetailRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, NotInOrganizationError } from '../domain/organization-onboarding.errors'
import { MembershipListingService } from './membership-listing.service'

function principalFixture(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

describe('MembershipListingService', () => {
    let directoryMock: jest.Mocked<MembershipDirectory>
    let service: MembershipListingService

    beforeEach(() => {
        directoryMock = { listForOrganization: jest.fn() }
        service = new MembershipListingService(directoryMock)
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.listForOrganization(actor, 'org-1')).rejects.toThrow(NotInOrganizationError)
    })

    it('rejects a member from listing members', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.listForOrganization(actor, 'org-1')).rejects.toThrow(InsufficientPermissionError)
    })

    it('returns active and disabled memberships for an owner or admin', async () => {
        const memberships: OrganizationMembershipDetailRecord[] = [
            {
                id: 'membership-1',
                organizationId: 'org-1',
                externalIdentityId: 'ext-1',
                externalIdentitySubject: 'kc-subject-1',
                email: 'member@example.test',
                role: 'member',
                status: 'active',
            },
            {
                id: 'membership-2', organizationId: 'org-1', externalIdentityId: 'ext-2',
                externalIdentitySubject: 'kc-subject-2', email: null, role: 'member', status: 'disabled',
            },
        ]
        directoryMock.listForOrganization.mockResolvedValue(memberships)

        const result = await service.listForOrganization(principalFixture(), 'org-1')

        expect(result).toBe(memberships)
        expect(directoryMock.listForOrganization).toHaveBeenCalledWith('org-1')
    })
})
