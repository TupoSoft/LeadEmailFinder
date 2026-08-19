import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { KeycloakServiceClientAdmin } from './keycloak-service-client-admin'
import { ServiceClientRotationService } from './service-client-rotation.service'

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

describe('ServiceClientRotationService', () => {
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'findOneBy'>>
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let keycloakAdminMock: jest.Mocked<KeycloakServiceClientAdmin>
    let service: ServiceClientRotationService

    beforeEach(() => {
        repoMock = { findOneBy: jest.fn() }
        managerMock = { save: jest.fn(), insert: jest.fn() }
        managerMock.save.mockImplementation((entity: any, data: any) => Promise.resolve(data))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        keycloakAdminMock = { provisionClient: jest.fn(), rotateSecret: jest.fn(), deleteClient: jest.fn() }
        service = new ServiceClientRotationService(
            repoMock as unknown as Repository<ServiceCredential>,
            dataSourceMock as unknown as DataSource,
            keycloakAdminMock,
        )
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(NotFoundException)
        expect(repoMock.findOneBy).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ForbiddenException)
    })

    it('returns 404 for a cross-organization service client', async () => {
        const actor = principalFixture()
        repoMock.findOneBy.mockResolvedValue(null)

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(NotFoundException)
    })

    it('rejects rotating a disabled service client', async () => {
        const actor = principalFixture()
        repoMock.findOneBy.mockResolvedValue({ id: 'sc-1', status: 'disabled' } as ServiceCredential)

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ConflictException)
        expect(keycloakAdminMock.rotateSecret).not.toHaveBeenCalled()
    })

    it('calls Keycloak before writing any local state', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', keycloakClientId: 'lef-svc-1', status: 'active' } as ServiceCredential
        repoMock.findOneBy.mockResolvedValue(credential)
        keycloakAdminMock.rotateSecret.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow('keycloak unreachable')
        expect(dataSourceMock.transaction).not.toHaveBeenCalled()
    })

    it('rotates the secret and writes an audit entry on success', async () => {
        const actor = principalFixture()
        const credential = { id: 'sc-1', keycloakClientId: 'lef-svc-1', status: 'active' } as ServiceCredential
        repoMock.findOneBy.mockResolvedValue(credential)
        keycloakAdminMock.rotateSecret.mockResolvedValue('new-secret')

        const result = await service.rotate(actor, 'org-1', 'sc-1')

        expect(keycloakAdminMock.rotateSecret).toHaveBeenCalledWith('lef-svc-1')
        expect(result.secret).toBe('new-secret')
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'service_client.rotated', organizationId: 'org-1' }),
        )
    })
})
