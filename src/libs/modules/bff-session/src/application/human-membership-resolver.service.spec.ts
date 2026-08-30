import { ActiveMembershipReader, OrganizationMembershipRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'
import { HumanMembershipResolver, SingleActiveMembershipRequiredError } from './human-membership-resolver.service'

describe('HumanMembershipResolver', () => {
    let readerMock: jest.Mocked<ActiveMembershipReader>
    let resolver: HumanMembershipResolver

    beforeEach(() => {
        readerMock = { findByOrganizationAndExternalIdentity: jest.fn(), findActiveForExternalIdentity: jest.fn() }
        resolver = new HumanMembershipResolver(readerMock)
    })

    describe('resolveActive', () => {
        it('returns the membership when active', async () => {
            const membership = { status: 'active', role: 'member' } as OrganizationMembershipRecord
            readerMock.findByOrganizationAndExternalIdentity.mockResolvedValue(membership)

            await expect(resolver.resolveActive('org-1', 'identity-1')).resolves.toBe(membership)
        })

        it('throws CredentialRejectedError when no membership exists', async () => {
            readerMock.findByOrganizationAndExternalIdentity.mockResolvedValue(undefined)

            await expect(resolver.resolveActive('org-1', 'identity-1')).rejects.toThrow(CredentialRejectedError)
        })

        it('throws CredentialRejectedError when the membership is disabled', async () => {
            readerMock.findByOrganizationAndExternalIdentity.mockResolvedValue({
                status: 'disabled',
            } as OrganizationMembershipRecord)

            await expect(resolver.resolveActive('org-1', 'identity-1')).rejects.toThrow(CredentialRejectedError)
        })
    })

    describe('resolveActiveForLogin', () => {
        it('returns the single active membership', async () => {
            const membership = { organizationId: 'org-1', role: 'member' } as OrganizationMembershipRecord
            readerMock.findActiveForExternalIdentity.mockResolvedValue([membership])

            await expect(resolver.resolveActiveForLogin('identity-1')).resolves.toBe(membership)
        })

        it('rejects when there are zero active memberships', async () => {
            readerMock.findActiveForExternalIdentity.mockResolvedValue([])

            await expect(resolver.resolveActiveForLogin('identity-1')).rejects.toThrow(SingleActiveMembershipRequiredError)
        })

        it('rejects when there is more than one active membership', async () => {
            readerMock.findActiveForExternalIdentity.mockResolvedValue([
                { organizationId: 'org-1' } as OrganizationMembershipRecord,
                { organizationId: 'org-2' } as OrganizationMembershipRecord,
            ])

            await expect(resolver.resolveActiveForLogin('identity-1')).rejects.toThrow(SingleActiveMembershipRequiredError)
        })
    })
})
