import {
    InvitationAcceptanceSession,
    InvitationAcceptanceStore,
    InvitationStore,
    OrganizationInvitationRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { hashInvitationToken } from '../domain/invitation-token'
import { ConflictingMembershipError, InvitationExpiredError, InvitationNotFoundError } from '../domain/organization-onboarding.errors'
import { InvitationAcceptanceService } from './invitation-acceptance.service'
import { KeycloakOrganizationAdmin } from './ports/keycloak-organization-admin'

const issuer = 'https://issuer'

function invitationFixture(overrides: Partial<OrganizationInvitationRecord> = {}): OrganizationInvitationRecord {
    return {
        id: 'invitation-1',
        organizationId: 'org-1',
        email: 'invitee@example.test',
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    }
}

describe('InvitationAcceptanceService', () => {
    let invitationStoreMock: jest.Mocked<InvitationStore>
    let acceptanceStoreMock: jest.Mocked<InvitationAcceptanceStore>
    let sessionMock: jest.Mocked<InvitationAcceptanceSession>
    let keycloakAdminMock: jest.Mocked<KeycloakOrganizationAdmin>
    let service: InvitationAcceptanceService

    beforeEach(() => {
        invitationStoreMock = { issueWithAudit: jest.fn(), findByTokenHash: jest.fn(), recordAcceptanceFailure: jest.fn() }
        sessionMock = { complete: jest.fn(), abort: jest.fn() }
        acceptanceStoreMock = { begin: jest.fn() }
        keycloakAdminMock = { ensureUser: jest.fn(), assignRealmRole: jest.fn() }
        keycloakAdminMock.ensureUser.mockResolvedValue({ subject: 'keycloak-subject-1', created: false })
        acceptanceStoreMock.begin.mockResolvedValue({ kind: 'ready', session: sessionMock })
        sessionMock.complete.mockResolvedValue({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })

        service = new InvitationAcceptanceService(invitationStoreMock, acceptanceStoreMock, keycloakAdminMock, issuer)
    })

    it('throws InvitationNotFoundError for an unknown token', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(undefined)

        await expect(service.accept('unknown-token', 'password12345')).rejects.toThrow(InvitationNotFoundError)
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('throws InvitationExpiredError for an expired invitation without calling Keycloak', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(
            invitationFixture({ expiresAt: new Date(Date.now() - 1000) }),
        )

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow(InvitationExpiredError)
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('returns the same result idempotently for an already-accepted invitation without calling Keycloak', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(
            invitationFixture({ status: 'accepted', role: 'admin', email: 'invitee@example.test' }),
        )

        const result = await service.accept('the-raw-token', 'password12345')

        expect(result).toEqual({ organizationId: 'org-1', role: 'admin', email: 'invitee@example.test' })
        expect(keycloakAdminMock.ensureUser).not.toHaveBeenCalled()
    })

    it('creates the human identity and membership on a happy-path acceptance', async () => {
        const invitation = invitationFixture()
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitation)

        const result = await service.accept('the-raw-token', 'password12345')

        expect(invitationStoreMock.findByTokenHash).toHaveBeenCalledWith(hashInvitationToken('the-raw-token'))
        expect(keycloakAdminMock.ensureUser).toHaveBeenCalledWith({
            email: 'invitee@example.test',
            password: 'password12345',
        })
        expect(acceptanceStoreMock.begin).toHaveBeenCalledWith(invitation, issuer, 'keycloak-subject-1')
        expect(sessionMock.complete).toHaveBeenCalled()
        expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
    })

    it('assigns the Keycloak realm role only for owner/admin invitations, never member', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture({ role: 'member' }))

        await service.accept('the-raw-token', 'password12345')

        expect(keycloakAdminMock.assignRealmRole).not.toHaveBeenCalled()
    })

    it('assigns the Keycloak realm role for an owner invitation, after the store session has begun', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture({ role: 'owner' }))

        await service.accept('the-raw-token', 'password12345')

        expect(keycloakAdminMock.assignRealmRole).toHaveBeenCalledWith('keycloak-subject-1', 'owner')
        expect(acceptanceStoreMock.begin.mock.invocationCallOrder[0]).toBeLessThan(
            keycloakAdminMock.assignRealmRole.mock.invocationCallOrder[0],
        )
    })

    it('leaves the invitation pending and writes a failure audit row when the Keycloak ensureUser call fails', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture())
        keycloakAdminMock.ensureUser.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow('keycloak unreachable')

        expect(invitationStoreMock.recordAcceptanceFailure).toHaveBeenCalledWith(expect.anything(), issuer)
        expect(acceptanceStoreMock.begin).not.toHaveBeenCalled()
    })

    it('throws ConflictingMembershipError when the identity already holds an active membership elsewhere', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture({ role: 'owner' }))
        acceptanceStoreMock.begin.mockResolvedValue({ kind: 'conflicting-membership' })

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow(ConflictingMembershipError)
        expect(keycloakAdminMock.assignRealmRole).not.toHaveBeenCalled()
        expect(invitationStoreMock.recordAcceptanceFailure).not.toHaveBeenCalled()
    })

    it('aborts the session and audits a realm-role assignment failure, leaving the invitation retryable', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture({ role: 'owner' }))
        keycloakAdminMock.assignRealmRole.mockRejectedValue(new Error('keycloak unreachable'))

        await expect(service.accept('the-raw-token', 'password12345')).rejects.toThrow('keycloak unreachable')

        expect(invitationStoreMock.recordAcceptanceFailure).toHaveBeenCalledWith(expect.anything(), issuer)
        expect(sessionMock.complete).not.toHaveBeenCalled()
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('returns the winning result without calling abort when begin() itself reports already-accepted', async () => {
        invitationStoreMock.findByTokenHash.mockResolvedValue(invitationFixture())
        acceptanceStoreMock.begin.mockResolvedValue({
            kind: 'already-accepted',
            result: { organizationId: 'org-1', role: 'member', email: 'invitee@example.test' },
        })

        const result = await service.accept('the-raw-token', 'password12345')

        expect(result).toEqual({ organizationId: 'org-1', role: 'member', email: 'invitee@example.test' })
        expect(sessionMock.complete).not.toHaveBeenCalled()
        expect(sessionMock.abort).not.toHaveBeenCalled()
    })
})
