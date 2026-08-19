import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientDisablementService } from './service-client-disablement.service'

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

describe('ServiceClientDisablementService', () => {
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'findOneBy'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let service: ServiceClientDisablementService

    beforeEach(() => {
        repoMock = { findOneBy: jest.fn() }
        managerMock = { save: jest.fn(), insert: jest.fn() }
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        service = new ServiceClientDisablementService(
            repoMock as unknown as Repository<ServiceCredential>,
            dataSourceMock as unknown as DataSource,
        )
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('returns 404 for a cross-organization service client', async () => {
        const actor = principalFixture()
        repoMock.findOneBy.mockResolvedValue(null)

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(NotFoundException)
    })

    it('is an idempotent no-op on an already-disabled service client', async () => {
        const actor = principalFixture()
        repoMock.findOneBy.mockResolvedValue({ id: 'sc-1', status: 'disabled' } as ServiceCredential)

        await service.disable(actor, 'org-1', 'sc-1')

        expect(dataSourceMock.transaction).not.toHaveBeenCalled()
    })

    it('disables the credential and writes an audit entry, with no Keycloak call', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', status: 'active' } as ServiceCredential
        repoMock.findOneBy.mockResolvedValue(credential)

        await service.disable(actor, 'org-1', 'sc-1')

        expect(credential.status).toBe('disabled')
        expect(managerMock.save).toHaveBeenCalledWith(ServiceCredential, credential)
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'service_client.disabled', organizationId: 'org-1' }),
        )
    })
})
