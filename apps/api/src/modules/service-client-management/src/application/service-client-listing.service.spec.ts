import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientAccessDeniedError } from '../domain/service-client-management.errors'
import { ServiceClientListingService } from './service-client-listing.service'

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

describe('ServiceClientListingService', () => {
    let directory: jest.Mocked<ServiceCredentialDirectory>
    let service: ServiceClientListingService

    beforeEach(() => {
        directory = { listForOrganization: jest.fn(), findByIdForOrganization: jest.fn() }
        service = new ServiceClientListingService(directory)
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ServiceClientAccessDeniedError)
        expect(directory.listForOrganization).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', membershipRole: 'platform_admin' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('rejects a member (non owner/admin) from listing service clients', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('returns every service client for the organization, including disabled ones', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', status: 'disabled' } as ServiceCredentialDetailRecord
        directory.listForOrganization.mockResolvedValue([credential])

        const result = await service.list(actor, 'org-1')

        expect(directory.listForOrganization).toHaveBeenCalledWith('org-1')
        expect(result).toEqual([credential])
    })
})
