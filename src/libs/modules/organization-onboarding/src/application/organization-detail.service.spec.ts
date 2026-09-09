import { AuthPrincipal, OrganizationDirectoryReader } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, OrganizationNotFoundError } from '../domain/organization-onboarding.errors'
import { OrganizationDetailService } from './organization-detail.service'

const actor: AuthPrincipal = {
    credentialKind: 'human_session', issuer: 'https://issuer', subject: 'operator',
    organizationId: 'organization', membershipRole: 'platform_admin', permissions: [], credentialId: 'identity',
}
const organization = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Synthetic organization',
    createdAt: new Date('2026-09-09T12:34:56.789Z'), updatedAt: new Date('2026-09-09T12:34:56.790Z'),
}

describe('OrganizationDetailService', () => {
    let reader: jest.Mocked<OrganizationDirectoryReader>
    let service: OrganizationDetailService

    beforeEach(() => {
        reader = { list: jest.fn(), findById: jest.fn().mockResolvedValue(organization) }
        service = new OrganizationDetailService(reader)
    })

    it.each(['member', 'admin', 'owner'] as const)('rejects the %s customer role before reading', async membershipRole => {
        await expect(service.get({ ...actor, membershipRole }, organization.id)).rejects.toThrow(InsufficientPermissionError)
        expect(reader.findById).not.toHaveBeenCalled()
    })

    it('does not infer service client permission from its role', async () => {
        await expect(service.get({ ...actor, credentialKind: 'service_client' }, organization.id)).rejects.toThrow(InsufficientPermissionError)
        expect(reader.findById).not.toHaveBeenCalled()
    })

    it.each([
        actor,
        { ...actor, credentialKind: 'service_client' as const, membershipRole: 'member' as const, permissions: ['platform:admin' as const] },
    ])('returns the authoritative organization for a platform principal %# without scanning pages', async principal => {
        await expect(service.get(principal, organization.id)).resolves.toEqual(organization)
        expect(reader.findById).toHaveBeenCalledWith(organization.id)
        expect(reader.list).not.toHaveBeenCalled()
    })

    it('throws a typed non-disclosing error when the organization is absent', async () => {
        reader.findById.mockResolvedValue(null)
        await expect(service.get(actor, organization.id)).rejects.toThrow(OrganizationNotFoundError)
        await expect(service.get(actor, organization.id)).rejects.toThrow('Organization not found')
    })

    it('propagates persistence failures', async () => {
        const failure = new Error('store unavailable')
        reader.findById.mockRejectedValue(failure)
        await expect(service.get(actor, organization.id)).rejects.toBe(failure)
    })
})
