import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource, EntityManager } from 'typeorm'
import { AuditLogEntry, AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { KeycloakServiceClientAdmin } from './keycloak-service-client-admin'
import { ServiceClientCreationService } from './service-client-creation.service'

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

describe('ServiceClientCreationService', () => {
    let managerMock: jest.Mocked<Pick<EntityManager, 'save' | 'create' | 'insert'>>
    let dataSourceMock: { transaction: jest.Mock }
    let keycloakAdminMock: jest.Mocked<KeycloakServiceClientAdmin>
    let configServiceMock: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>
    let service: ServiceClientCreationService

    beforeEach(() => {
        managerMock = { save: jest.fn(), create: jest.fn(), insert: jest.fn() }
        managerMock.create.mockImplementation((entity, data) => data as never)
        managerMock.save.mockImplementation((entity: any, data: any) => Promise.resolve({ ...data }))
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
        }
        keycloakAdminMock = {
            provisionClient: jest.fn(),
            rotateSecret: jest.fn(),
            deleteClient: jest.fn(),
        }
        configServiceMock = { getOrThrow: jest.fn().mockReturnValue('https://issuer') }
        service = new ServiceClientCreationService(
            dataSourceMock as unknown as DataSource,
            keycloakAdminMock,
            configServiceMock as unknown as ConfigService,
            new RolePermissionPolicy(),
        )
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ForbiddenException)
        expect(keycloakAdminMock.provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor even with credentials:manage', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ForbiddenException)
        expect(keycloakAdminMock.provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a member (non owner/admin) from creating a service client', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ForbiddenException)
    })

    it('rejects permissions beyond the actor own effective permissions', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.create(actor, 'org-1', null, ['billing:manage'])).rejects.toThrow(BadRequestException)
        expect(keycloakAdminMock.provisionClient).not.toHaveBeenCalled()
    })

    it('allows an admin to grant a subset of their own permissions', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })
        keycloakAdminMock.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })

        await expect(
            service.create(actor, 'org-1', null, ['verification:run', 'credentials:manage']),
        ).resolves.toBeDefined()
    })

    it('leaves no local row when the Keycloak call fails', async () => {
        const actor = principalFixture()
        keycloakAdminMock.provisionClient.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow('keycloak unreachable')
        expect(dataSourceMock.transaction).not.toHaveBeenCalled()
    })

    it('deletes the newly provisioned Keycloak client when the local transaction fails', async () => {
        const actor = principalFixture()
        keycloakAdminMock.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        dataSourceMock.transaction.mockRejectedValue(new Error('database unavailable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow('database unavailable')
        expect(keycloakAdminMock.deleteClient).toHaveBeenCalledWith(expect.stringMatching(/^lef-svc-/))
    })

    it('preserves the local transaction error when compensating Keycloak deletion also fails', async () => {
        const actor = principalFixture()
        keycloakAdminMock.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        dataSourceMock.transaction.mockRejectedValue(new Error('database unavailable'))
        keycloakAdminMock.deleteClient.mockRejectedValue(new Error('cleanup unavailable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow('database unavailable')
    })

    it('creates the local row and writes an audit entry on success', async () => {
        const actor = principalFixture()
        keycloakAdminMock.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })

        const result = await service.create(actor, 'org-1', 'my integration', ['verification:run'])

        expect(result.secret).toBe('a-secret')
        expect(managerMock.create).toHaveBeenCalledWith(
            ServiceCredential,
            expect.objectContaining({
                organizationId: 'org-1',
                issuer: 'https://issuer',
                subject: 'sa-1',
                description: 'my integration',
                permissions: ['verification:run'],
                status: 'active',
            }),
        )
        expect(managerMock.insert).toHaveBeenCalledWith(
            AuditLogEntry,
            expect.objectContaining({ action: 'service_client.created', organizationId: 'org-1' }),
        )
    })
})
