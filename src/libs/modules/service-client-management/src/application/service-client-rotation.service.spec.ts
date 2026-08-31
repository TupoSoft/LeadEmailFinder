import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    DisabledServiceClientRotationError,
    ServiceClientAccessDeniedError,
    ServiceClientNotFoundError,
} from '../domain/service-client-management.errors'
import { KeycloakServiceClientAdmin } from './ports/keycloak-service-client-admin'
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

describe('ServiceClientRotationService', () => {
    let directory: jest.Mocked<ServiceCredentialDirectory>
    let writer: jest.Mocked<ServiceCredentialWriter>
    let keycloakAdmin: jest.Mocked<KeycloakServiceClientAdmin>
    let service: ServiceClientRotationService

    beforeEach(() => {
        directory = { listForOrganization: jest.fn(), findByIdForOrganization: jest.fn() }
        writer = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        keycloakAdmin = { provisionClient: jest.fn(), rotateSecret: jest.fn(), deleteClient: jest.fn() }
        service = new ServiceClientRotationService(directory, writer, keycloakAdmin)
    })

    it('conceals an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
        expect(directory.findByIdForOrganization).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('returns not found for a cross-organization service client', async () => {
        directory.findByIdForOrganization.mockResolvedValue(undefined)

        await expect(service.rotate(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
        expect(directory.findByIdForOrganization).toHaveBeenCalledWith('sc-1', 'org-1')
    })

    it('rejects rotating a disabled service client', async () => {
        directory.findByIdForOrganization.mockResolvedValue(credentialFixture({ status: 'disabled' }))

        await expect(service.rotate(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(
            DisabledServiceClientRotationError,
        )
        expect(keycloakAdmin.rotateSecret).not.toHaveBeenCalled()
    })

    it('calls Keycloak before writing any local state', async () => {
        directory.findByIdForOrganization.mockResolvedValue(credentialFixture())
        keycloakAdmin.rotateSecret.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.rotate(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow('keycloak unreachable')
        expect(writer.rotateWithAudit).not.toHaveBeenCalled()
    })

    it('rotates the secret and writes the audit through the identity writer on success', async () => {
        const actor = principalFixture()
        const credential = credentialFixture()
        const updated = credentialFixture({ updatedAt: new Date('2026-01-02T00:00:00.000Z') })
        directory.findByIdForOrganization.mockResolvedValue(credential)
        keycloakAdmin.rotateSecret.mockResolvedValue('new-secret')
        writer.rotateWithAudit.mockResolvedValue({ kind: 'rotated', credential: updated })

        await expect(service.rotate(actor, 'org-1', 'sc-1')).resolves.toEqual({
            credential: updated,
            secret: 'new-secret',
        })
        expect(keycloakAdmin.rotateSecret).toHaveBeenCalledWith('lef-svc-1')
        expect(writer.rotateWithAudit).toHaveBeenCalledWith(credential, actor)
    })

    it.each([
        ['not-found', ServiceClientNotFoundError],
        ['disabled', DisabledServiceClientRotationError],
    ] as const)('maps a concurrent %s persistence outcome after provider rotation', async (kind, ErrorType) => {
        directory.findByIdForOrganization.mockResolvedValue(credentialFixture())
        keycloakAdmin.rotateSecret.mockResolvedValue('new-secret')
        writer.rotateWithAudit.mockResolvedValue({ kind })

        await expect(service.rotate(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ErrorType)
    })
})
