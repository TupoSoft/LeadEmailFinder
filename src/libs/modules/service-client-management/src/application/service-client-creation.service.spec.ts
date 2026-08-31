import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import {
    ServiceClientAccessDeniedError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'
import { KeycloakServiceClientAdmin } from './ports/keycloak-service-client-admin'
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

function credentialFixture(overrides: Partial<ServiceCredentialDetailRecord> = {}): ServiceCredentialDetailRecord {
    return {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'sa-1',
        keycloakClientId: 'lef-svc-1',
        description: null,
        permissions: [],
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }
}

describe('ServiceClientCreationService', () => {
    let credentialWriter: jest.Mocked<ServiceCredentialWriter>
    let keycloakAdmin: jest.Mocked<KeycloakServiceClientAdmin>
    let service: ServiceClientCreationService

    beforeEach(() => {
        credentialWriter = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        keycloakAdmin = {
            provisionClient: jest.fn(),
            rotateSecret: jest.fn(),
            deleteClient: jest.fn(),
        }
        service = new ServiceClientCreationService(
            credentialWriter,
            keycloakAdmin,
            { issuer: 'https://issuer' },
            new RolePermissionPolicy(),
        )
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ServiceClientAccessDeniedError)
        expect(keycloakAdmin.provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor even with credentials:manage', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ServiceClientAccessDeniedError)
        expect(keycloakAdmin.provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a member (non owner/admin) from creating a service client', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('rejects permissions beyond the actor own effective permissions', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.create(actor, 'org-1', null, ['billing:manage'])).rejects.toThrow(
            ServiceClientPermissionCeilingExceededError,
        )
        expect(keycloakAdmin.provisionClient).not.toHaveBeenCalled()
    })

    it('allows an admin to grant a subset of their own permissions', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })
        keycloakAdmin.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        credentialWriter.createWithAudit.mockResolvedValue(credentialFixture())

        await expect(
            service.create(actor, 'org-1', null, ['verification:run', 'credentials:manage']),
        ).resolves.toBeDefined()
    })

    it('leaves no local row when the Keycloak call fails', async () => {
        const actor = principalFixture()
        keycloakAdmin.provisionClient.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow('keycloak unreachable')
        expect(credentialWriter.createWithAudit).not.toHaveBeenCalled()
    })

    it('deletes the newly provisioned Keycloak client when the local transaction fails', async () => {
        const actor = principalFixture()
        keycloakAdmin.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        credentialWriter.createWithAudit.mockRejectedValue(new Error('database unavailable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toThrow('database unavailable')
        expect(keycloakAdmin.deleteClient).toHaveBeenCalledWith(expect.stringMatching(/^lef-svc-/))
    })

    it('preserves the local transaction error when compensating Keycloak deletion also fails', async () => {
        const actor = principalFixture()
        const persistenceError = new Error('database unavailable')
        keycloakAdmin.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        credentialWriter.createWithAudit.mockRejectedValue(persistenceError)
        keycloakAdmin.deleteClient.mockRejectedValue(new Error('cleanup unavailable'))

        await expect(service.create(actor, 'org-1', null, [])).rejects.toBe(persistenceError)
    })

    it('creates the local row and audit through the identity writer on success', async () => {
        const actor = principalFixture()
        const credential = credentialFixture({
            description: 'my integration',
            permissions: ['verification:run'],
        })
        keycloakAdmin.provisionClient.mockResolvedValue({ subject: 'sa-1', secret: 'a-secret' })
        credentialWriter.createWithAudit.mockResolvedValue(credential)

        const result = await service.create(actor, 'org-1', 'my integration', ['verification:run'])

        expect(result).toEqual({ credential, secret: 'a-secret' })
        expect(credentialWriter.createWithAudit).toHaveBeenCalledWith({
            id: expect.any(String),
            organizationId: 'org-1',
            issuer: 'https://issuer',
            subject: 'sa-1',
            keycloakClientId: expect.stringMatching(/^lef-svc-/),
            description: 'my integration',
            permissions: ['verification:run'],
            actor,
        })
    })
})
