import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'
import { HumanMembershipResolver } from './human-membership-resolver.service'

describe('HumanMembershipResolver', () => {
    let membershipRepo: jest.Mocked<Pick<Repository<OrganizationMembership>, 'findOne' | 'find'>>
    let resolver: HumanMembershipResolver

    beforeEach(() => {
        membershipRepo = { findOne: jest.fn(), find: jest.fn() }
        resolver = new HumanMembershipResolver(membershipRepo as unknown as Repository<OrganizationMembership>)
    })

    describe('resolveActive', () => {
        it('returns the membership when active', async () => {
            const membership = { status: 'active', role: 'member' } as OrganizationMembership
            membershipRepo.findOne.mockResolvedValue(membership)

            await expect(resolver.resolveActive('org-1', 'identity-1')).resolves.toBe(membership)
        })

        it('throws when no membership exists', async () => {
            membershipRepo.findOne.mockResolvedValue(null)

            await expect(resolver.resolveActive('org-1', 'identity-1')).rejects.toThrow(UnauthorizedException)
        })

        it('throws when the membership is disabled', async () => {
            membershipRepo.findOne.mockResolvedValue({ status: 'disabled' } as OrganizationMembership)

            await expect(resolver.resolveActive('org-1', 'identity-1')).rejects.toThrow(UnauthorizedException)
        })
    })

    describe('resolveActiveForLogin', () => {
        it('returns the single active membership', async () => {
            const membership = { organizationId: 'org-1', role: 'member' } as OrganizationMembership
            membershipRepo.find.mockResolvedValue([membership])

            await expect(resolver.resolveActiveForLogin('identity-1')).resolves.toBe(membership)
        })

        it('rejects when there are zero active memberships', async () => {
            membershipRepo.find.mockResolvedValue([])

            await expect(resolver.resolveActiveForLogin('identity-1')).rejects.toThrow(ForbiddenException)
        })

        it('rejects when there is more than one active membership', async () => {
            membershipRepo.find.mockResolvedValue([
                { organizationId: 'org-1' } as OrganizationMembership,
                { organizationId: 'org-2' } as OrganizationMembership,
            ])

            await expect(resolver.resolveActiveForLogin('identity-1')).rejects.toThrow(ForbiddenException)
        })
    })
})
