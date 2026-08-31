import { AuthPrincipal, InvitationStore } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, NotInOrganizationError } from '../domain/organization-onboarding.errors'
import { InvitationIssuanceService } from './invitation-issuance.service'

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

describe('InvitationIssuanceService', () => {
    let storeMock: jest.Mocked<InvitationStore>
    let service: InvitationIssuanceService

    beforeEach(() => {
        storeMock = { issueWithAudit: jest.fn(), findByTokenHash: jest.fn(), recordAcceptanceFailure: jest.fn() }
        storeMock.issueWithAudit.mockImplementation(command =>
            Promise.resolve({
                id: 'invitation-1',
                organizationId: command.organizationId,
                email: command.email,
                role: command.role,
                status: 'pending',
                expiresAt: command.expiresAt,
            }),
        )
        service = new InvitationIssuanceService(storeMock)
    })

    it('rejects an actor who does not belong to the target organization', async () => {
        const actor = principalFixture({ organizationId: 'a-different-org' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'member')).rejects.toThrow(
            NotInOrganizationError,
        )
        expect(storeMock.issueWithAudit).not.toHaveBeenCalled()
    })

    it('rejects a member (non owner/admin) from issuing an invitation', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'member')).rejects.toThrow(
            InsufficientPermissionError,
        )
    })

    it('rejects an admin who tries to grant the owner role', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'owner')).rejects.toThrow(
            InsufficientPermissionError,
        )
    })

    it('allows an admin to invite a member or another admin', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.issue(actor, 'org-1', 'new@example.test', 'admin')).resolves.toBeDefined()
    })

    it('allows an owner to invite an owner, admin, or member, normalizing the email', async () => {
        const actor = principalFixture({ membershipRole: 'owner' })

        const result = await service.issue(actor, 'org-1', 'New@Example.test', 'owner')

        expect(result.rawToken).toEqual(expect.any(String))
        expect(storeMock.issueWithAudit).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'org-1', email: 'new@example.test', role: 'owner', actor }),
        )
    })
})
