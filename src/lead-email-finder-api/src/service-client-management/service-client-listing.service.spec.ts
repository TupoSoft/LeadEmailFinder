import { ForbiddenException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
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
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'find'>>
    let service: ServiceClientListingService

    beforeEach(() => {
        repoMock = { find: jest.fn() }
        service = new ServiceClientListingService(repoMock as unknown as Repository<ServiceCredential>)
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'legacy_api_key', membershipRole: 'platform_admin' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member (non owner/admin) from listing service clients', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.list(actor, 'org-1')).rejects.toThrow(ForbiddenException)
    })

    it('returns every service client for the organization, including disabled ones', async () => {
        const actor = principalFixture()
        repoMock.find.mockResolvedValue([{ id: 'sc-1', status: 'disabled' } as ServiceCredential])

        const result = await service.list(actor, 'org-1')

        expect(repoMock.find).toHaveBeenCalledWith({
            where: { organizationId: 'org-1' },
            order: { createdAt: 'ASC' },
        })
        expect(result).toEqual([{ id: 'sc-1', status: 'disabled' }])
    })
})
