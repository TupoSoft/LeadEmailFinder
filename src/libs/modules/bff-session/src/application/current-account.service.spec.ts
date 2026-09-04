import { AuthPrincipal, CurrentAccountReader, CurrentAccountRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientGrantPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { BrowserCapabilityPolicy } from './browser-capability-policy'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from './current-account.service'

const humanPrincipal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer.example.test',
    subject: 'human-subject',
    organizationId: 'org-1',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'external-identity-1',
}

const accountFixture: CurrentAccountRecord = {
    email: 'owner@example.test',
    membership: { id: 'membership-1', role: 'owner' },
    organization: { id: 'org-1', name: 'Example Organization' },
}

describe('CurrentAccountService', () => {
    let reader: jest.Mocked<CurrentAccountReader>
    let grantPolicy: jest.Mocked<ServiceClientGrantPolicy>
    let service: CurrentAccountService

    beforeEach(() => {
        reader = { read: jest.fn() }
        grantPolicy = { grantablePermissionsFor: jest.fn() }
        service = new CurrentAccountService(reader, new BrowserCapabilityPolicy(), grantPolicy)
    })

    it('returns the exact browser account contract for the authoritative membership role', async () => {
        reader.read.mockResolvedValue(accountFixture)
        grantPolicy.grantablePermissionsFor.mockReturnValue([
            'verification:run',
            'verification:read',
            'members:manage',
            'credentials:manage',
            'billing:read',
            'billing:manage',
        ])

        await expect(service.get(humanPrincipal)).resolves.toEqual({
            email: 'owner@example.test',
            membership: { id: 'membership-1', role: 'owner' },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: [
                'verification.run',
                'verification.read',
                'team.manage',
                'service_clients.manage',
                'billing.read',
                'billing.manage',
            ],
            grantableServiceClientPermissions: [
                'verification:run',
                'verification:read',
                'members:manage',
                'credentials:manage',
                'billing:read',
                'billing:manage',
            ],
        })
        expect(reader.read).toHaveBeenCalledWith({
            externalIdentityId: 'external-identity-1',
            organizationId: 'org-1',
        })
        expect(grantPolicy.grantablePermissionsFor).toHaveBeenCalledWith('owner')
    })

    it('preserves a null identity email', async () => {
        reader.read.mockResolvedValue({ ...accountFixture, email: null })
        grantPolicy.grantablePermissionsFor.mockReturnValue([])

        await expect(service.get(humanPrincipal)).resolves.toMatchObject({ email: null })
    })

    it('rejects a service-client principal before reading account state', async () => {
        await expect(service.get({ ...humanPrincipal, credentialKind: 'service_client' })).rejects.toBeInstanceOf(
            HumanSessionRequiredError,
        )
        expect(reader.read).not.toHaveBeenCalled()
        expect(grantPolicy.grantablePermissionsFor).not.toHaveBeenCalled()
    })

    it('reports unavailable account state through its typed error', async () => {
        reader.read.mockResolvedValue(undefined)

        await expect(service.get(humanPrincipal)).rejects.toBeInstanceOf(CurrentAccountUnavailableError)
        expect(grantPolicy.grantablePermissionsFor).not.toHaveBeenCalled()
    })

    it('preserves unexpected reader failures', async () => {
        const unexpected = new Error('database unavailable')
        reader.read.mockRejectedValue(unexpected)

        await expect(service.get(humanPrincipal)).rejects.toBe(unexpected)
    })
})
