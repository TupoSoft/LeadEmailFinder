import { ForbiddenException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { AuthPrincipal, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
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
    let membershipRepoMock: jest.Mocked<Pick<Repository<OrganizationMembership>, 'find'>>
    let service: MembershipListingService

    beforeEach(() => {
        membershipRepoMock = { find: jest.fn() }
        service = new MembershipListingService(membershipRepoMock as unknown as Repository<OrganizationMembership>)
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.listActive(actor, 'org-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member from listing members', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.listActive(actor, 'org-1')).rejects.toThrow(ForbiddenException)
    })

    it('returns memberships for an owner or admin', async () => {
        const memberships = [{ id: 'membership-1' } as OrganizationMembership]
        membershipRepoMock.find.mockResolvedValue(memberships)

        const result = await service.listActive(principalFixture(), 'org-1')

        expect(result).toBe(memberships)
        expect(membershipRepoMock.find).toHaveBeenCalledWith({
            where: { organizationId: 'org-1' },
            relations: ['externalIdentity'],
        })
    })
})
