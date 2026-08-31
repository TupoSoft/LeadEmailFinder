import { AuthPrincipal, OrganizationRegistrationStore } from '@tuposoft/lead-email-finder/modules/identity'
import { OrganizationCreationService } from './organization-creation.service'

function principalFixture(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'service_client',
        issuer: 'https://issuer',
        subject: 'service-account-1',
        organizationId: 'platform-org',
        membershipRole: 'platform_admin',
        permissions: ['platform:admin'],
        credentialId: 'credential-1',
        ...overrides,
    }
}

describe('OrganizationCreationService', () => {
    let storeMock: jest.Mocked<OrganizationRegistrationStore>
    let service: OrganizationCreationService

    beforeEach(() => {
        storeMock = { createWithOwnerInvitation: jest.fn() }
        storeMock.createWithOwnerInvitation.mockImplementation(command =>
            Promise.resolve({
                organization: { id: 'org-1', name: command.name },
                invitation: {
                    id: 'invitation-1',
                    organizationId: 'org-1',
                    email: command.ownerEmail,
                    role: 'owner',
                    status: 'pending',
                    expiresAt: command.expiresAt,
                },
            }),
        )
        service = new OrganizationCreationService(storeMock)
    })

    it('normalizes the owner email and generates a fresh, unique-looking token', async () => {
        const actor = principalFixture()

        const result = await service.createWithFirstOwner(actor, 'Acme', 'Owner@Example.test')

        expect(storeMock.createWithOwnerInvitation).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Acme', ownerEmail: 'owner@example.test', actor }),
        )
        expect(result.rawToken).toEqual(expect.any(String))
        expect(result.rawToken.length).toBeGreaterThan(16)
    })

    it('never passes the raw token to the store — only its hash', async () => {
        const result = await service.createWithFirstOwner(principalFixture(), 'Acme', 'owner@example.test')

        const command = storeMock.createWithOwnerInvitation.mock.calls[0][0]
        expect(command.tokenHash).not.toBe(result.rawToken)
        expect(command.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('sets the invitation to expire 72 hours from now', async () => {
        const before = Date.now()

        await service.createWithFirstOwner(principalFixture(), 'Acme', 'owner@example.test')

        const command = storeMock.createWithOwnerInvitation.mock.calls[0][0]
        const deltaMs = command.expiresAt.getTime() - before
        expect(deltaMs).toBeGreaterThan(72 * 60 * 60 * 1000 - 5000)
        expect(deltaMs).toBeLessThanOrEqual(72 * 60 * 60 * 1000 + 5000)
    })

    it('assembles the result from the store plus the raw token', async () => {
        const result = await service.createWithFirstOwner(principalFixture(), 'Acme', 'owner@example.test')

        expect(result.organization).toEqual({ id: 'org-1', name: 'Acme' })
        expect(result.invitation).toEqual(expect.objectContaining({ email: 'owner@example.test', role: 'owner' }))
    })
})
