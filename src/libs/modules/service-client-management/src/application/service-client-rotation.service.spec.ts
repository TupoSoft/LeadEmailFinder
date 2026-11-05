import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientRotationService } from './service-client-rotation.service'
import {
    DisabledServiceClientRotationError,
    ServiceClientAccessDeniedError,
    ServiceClientNotFoundError,
} from '../domain/service-client-management.errors'

const actor: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'issuer',
    subject: 'human',
    organizationId: 'org',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'human',
}
const credential: ServiceCredentialDetailRecord = {
    id: 'credential',
    issuer: 'issuer',
    subject: 'credential',
    organizationId: 'org',
    keyPrefix: 'lef_original',
    description: null,
    permissions: ['verification:run'],
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
}
const material = { apiKey: 'lef_new-key', keyHash: 'b'.repeat(64), keyPrefix: 'lef_replaced' }

describe('ServiceClientRotationService', () => {
    let directory: jest.Mocked<ServiceCredentialDirectory>
    let writer: jest.Mocked<ServiceCredentialWriter>
    let generator: jest.Mock
    let service: ServiceClientRotationService
    beforeEach(() => {
        directory = { listForOrganization: jest.fn(), findByIdForOrganization: jest.fn().mockResolvedValue(credential) }
        writer = {
            createWithAudit: jest.fn(),
            rotateWithAudit: jest.fn(),
            disableWithAudit: jest.fn(),
            deleteWithAudit: jest.fn(),
        }
        generator = jest.fn(() => material)
        service = new ServiceClientRotationService(directory, writer, generator)
    })
    it('conceals cross-organization targets before reading', async () => {
        await expect(service.rotate({ ...actor, organizationId: 'other' }, 'org', credential.id)).rejects.toThrow(
            ServiceClientNotFoundError,
        )
        expect(directory.findByIdForOrganization).not.toHaveBeenCalled()
    })
    it.each([{ credentialKind: 'service_client' as const }, { membershipRole: 'member' as const }])(
        'rejects unauthorized rotation %j',
        async overrides => {
            await expect(service.rotate({ ...actor, ...overrides }, 'org', credential.id)).rejects.toThrow(
                ServiceClientAccessDeniedError,
            )
            expect(generator).not.toHaveBeenCalled()
        },
    )
    it('does not issue replacement material for missing targets', async () => {
        directory.findByIdForOrganization.mockResolvedValue(undefined)
        await expect(service.rotate(actor, 'org', credential.id)).rejects.toThrow(ServiceClientNotFoundError)
        expect(generator).not.toHaveBeenCalled()
    })
    it('does not issue replacement material for disabled targets', async () => {
        directory.findByIdForOrganization.mockResolvedValue({ ...credential, status: 'disabled' })
        await expect(service.rotate(actor, 'org', credential.id)).rejects.toThrow(DisabledServiceClientRotationError)
        expect(generator).not.toHaveBeenCalled()
    })
    it('returns the replacement only after the scoped transaction commits', async () => {
        writer.rotateWithAudit.mockResolvedValue({
            kind: 'rotated',
            credential: { ...credential, keyPrefix: material.keyPrefix },
        })
        await expect(service.rotate(actor, 'org', credential.id)).resolves.toMatchObject({
            apiKey: material.apiKey,
            credential: { id: credential.id, keyPrefix: material.keyPrefix, permissions: credential.permissions },
        })
        expect(writer.rotateWithAudit).toHaveBeenCalledWith(credential, actor, {
            keyHash: material.keyHash,
            keyPrefix: material.keyPrefix,
        })
    })
    it.each([
        ['not-found', ServiceClientNotFoundError],
        ['disabled', DisabledServiceClientRotationError],
    ] as const)('rejects a concurrent %s result without disclosing replacement', async (kind, ErrorType) => {
        writer.rotateWithAudit.mockResolvedValue({ kind })
        await expect(service.rotate(actor, 'org', credential.id)).rejects.toThrow(ErrorType)
    })
    it('does not disclose material if audit persistence fails', async () => {
        writer.rotateWithAudit.mockRejectedValue(new Error('audit unavailable'))
        await expect(service.rotate(actor, 'org', credential.id)).rejects.toThrow('audit unavailable')
    })
})
