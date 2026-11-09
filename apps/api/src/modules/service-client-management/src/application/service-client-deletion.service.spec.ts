import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientAccessDeniedError, ServiceClientNotFoundError } from '../domain/service-client-management.errors'
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

function credentialFixture(): ServiceCredentialDetailRecord {
    return {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'sa-1',
        keyPrefix: 'lef-svc-1',
        description: null,
        permissions: ['credentials:manage'],
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
}

describe('ServiceClientDeletionService', () => {
    let directory: jest.Mocked<ServiceCredentialDirectory>
    let writer: jest.Mocked<ServiceCredentialWriter>
    let service: ServiceClientDeletionService

    beforeEach(() => {
        directory = { listForOrganization: jest.fn(), findByIdForOrganization: jest.fn() }
        writer = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        service = new ServiceClientDeletionService(directory, writer)
    })

    it('conceals an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
        expect(directory.findByIdForOrganization).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.delete(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('returns not found for a cross-organization service client', async () => {
        directory.findByIdForOrganization.mockResolvedValue(undefined)

        await expect(service.delete(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
    })

    it('deletes the local credential and audit through the identity writer', async () => {
        const actor = principalFixture()
        const credential = credentialFixture()
        directory.findByIdForOrganization.mockResolvedValue(credential)
        writer.deleteWithAudit.mockResolvedValue('deleted')

        await service.delete(actor, 'org-1', 'sc-1')

        expect(writer.deleteWithAudit).toHaveBeenCalledWith(credential, actor)
    })

    it('maps a concurrent local deletion after the provider call to not found', async () => {
        directory.findByIdForOrganization.mockResolvedValue(credentialFixture())
        writer.deleteWithAudit.mockResolvedValue('not-found')

        await expect(service.delete(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
    })
})
