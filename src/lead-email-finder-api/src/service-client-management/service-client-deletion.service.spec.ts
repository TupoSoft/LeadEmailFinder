import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { KeycloakServiceClientAdmin } from './keycloak-service-client-admin'
import { ServiceClientDeletionService } from './service-client-deletion.service'

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

describe('ServiceClientDeletionService', () => {
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'findOneBy'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'delete' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let keycloakAdminMock: jest.Mocked<KeycloakServiceClientAdmin>
    let service: ServiceClientDeletionService

    beforeEach(() => {
        repoMock = { findOneBy: jest.fn() }
        managerMock = { delete: jest.fn(), insert: jest.fn() }
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        keycloakAdminMock = { provisionClient: jest.fn(), rotateSecret: jest.fn(), deleteClient: jest.fn() }
        service = new ServiceClientDeletionService(
            repoMock as unknown as Repository<ServiceCredential>,
            dataSourceMock as unknown as DataSource,
            keycloakAdminMock,
        )
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
        expect(keycloakAdminMock.deleteClient).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('returns 404 for a cross-organization service client', async () => {
        const actor = principalFixture()
        repoMock.findOneBy.mockResolvedValue(null)

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(NotFoundException)
    })

    it('does not touch the local row when the Keycloak deletion fails', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', keycloakClientId: 'lef-svc-1' } as ServiceCredential
        repoMock.findOneBy.mockResolvedValue(credential)
        keycloakAdminMock.deleteClient.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow('keycloak unreachable')
        expect(dataSourceMock.transaction).not.toHaveBeenCalled()
    })

    it('deletes the Keycloak client first, then the local row, and writes an audit entry', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', keycloakClientId: 'lef-svc-1' } as ServiceCredential
        repoMock.findOneBy.mockResolvedValue(credential)
        keycloakAdminMock.deleteClient.mockResolvedValue(undefined)

        await service.delete(actor, 'org-1', 'sc-1')

        expect(keycloakAdminMock.deleteClient).toHaveBeenCalledWith('lef-svc-1')
        expect(managerMock.delete).toHaveBeenCalledWith(ServiceCredential, { id: 'sc-1' })
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'service_client.deleted', organizationId: 'org-1' }),
        )
    })
})
