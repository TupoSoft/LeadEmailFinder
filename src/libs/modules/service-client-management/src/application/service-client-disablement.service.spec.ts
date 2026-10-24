import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientAccessDeniedError, ServiceClientNotFoundError } from '../domain/service-client-management.errors'
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

function credentialFixture(overrides: Partial<ServiceCredentialDetailRecord> = {}): ServiceCredentialDetailRecord {
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
        ...overrides,
    }
}

describe('ServiceClientDisablementService', () => {
    let directory: jest.Mocked<ServiceCredentialDirectory>
    let writer: jest.Mocked<ServiceCredentialWriter>
    let service: ServiceClientDisablementService

    beforeEach(() => {
        directory = { listForOrganization: jest.fn(), findByIdForOrganization: jest.fn() }
        writer = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        service = new ServiceClientDisablementService(directory, writer)
    })

    it('conceals an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
        expect(directory.findByIdForOrganization).not.toHaveBeenCalled()
    })

    it('rejects a non-human-session actor', async () => {
        const actor = principalFixture({ credentialKind: 'service_client', permissions: ['credentials:manage'] })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('rejects a member (non owner/admin)', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.disable(actor, 'org-1', 'sc-1')).rejects.toThrow(ServiceClientAccessDeniedError)
    })

    it('returns not found for a cross-organization service client', async () => {
        directory.findByIdForOrganization.mockResolvedValue(undefined)

        await expect(service.disable(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
    })

    it('is an idempotent no-op on an already-disabled service client', async () => {
        const actor = principalFixture()
        const credential = credentialFixture({ status: 'disabled' })
        directory.findByIdForOrganization.mockResolvedValue(credential)
        writer.disableWithAudit.mockResolvedValue('already-disabled')

        await service.disable(actor, 'org-1', 'sc-1')

        expect(writer.disableWithAudit).toHaveBeenCalledWith(credential, actor)
    })

    it('disables the credential and writes the audit through the identity writer, with no provider call', async () => {
        const actor = principalFixture()
        const credential = credentialFixture()
        directory.findByIdForOrganization.mockResolvedValue(credential)
        writer.disableWithAudit.mockResolvedValue('disabled')

        await service.disable(actor, 'org-1', 'sc-1')

        expect(writer.disableWithAudit).toHaveBeenCalledWith(credential, actor)
    })

    it('maps a concurrent deletion to not found', async () => {
        directory.findByIdForOrganization.mockResolvedValue(credentialFixture())
        writer.disableWithAudit.mockResolvedValue('not-found')

        await expect(service.disable(principalFixture(), 'org-1', 'sc-1')).rejects.toThrow(ServiceClientNotFoundError)
    })
})
