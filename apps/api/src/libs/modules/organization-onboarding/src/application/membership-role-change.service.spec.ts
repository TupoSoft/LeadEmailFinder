import {
    AuthPrincipal,
    MembershipMutationSession,
    MembershipMutationStore,
    OrganizationMembershipDetailRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    FinalOwnerConflictError,
    InsufficientPermissionError,
    MembershipNotFoundError,
    NotInOrganizationError,
} from '../domain/organization-onboarding.errors'
import { MembershipRoleChangeService } from './membership-role-change.service'
import { KeycloakOrganizationAdmin } from './ports/keycloak-organization-admin'

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

function membershipFixture(overrides: Partial<OrganizationMembershipDetailRecord> = {}): OrganizationMembershipDetailRecord {
    return {
        id: 'membership-1',
        organizationId: 'org-1',
        externalIdentityId: 'target-identity-1',
        externalIdentitySubject: 'target-subject-1',
        email: 'target@example.test',
        role: 'member',
        status: 'active',
        ...overrides,
    }
}

describe('MembershipRoleChangeService', () => {
    let storeMock: jest.Mocked<MembershipMutationStore>
    let sessionMock: jest.Mocked<MembershipMutationSession>
    let keycloakAdminMock: jest.Mocked<KeycloakOrganizationAdmin>
    let service: MembershipRoleChangeService

    beforeEach(() => {
        sessionMock = { changeRole: jest.fn(), disable: jest.fn(), abort: jest.fn() }
        sessionMock.changeRole.mockImplementation(newRole => Promise.resolve(membershipFixture({ role: newRole })))
        storeMock = { begin: jest.fn() }
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture(), activeOwnerCount: 0 },
            session: sessionMock,
        })
        keycloakAdminMock = { ensureUser: jest.fn(), assignRealmRole: jest.fn() }
        service = new MembershipRoleChangeService(storeMock, keycloakAdminMock)
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            NotInOrganizationError,
        )
        expect(storeMock.begin).not.toHaveBeenCalled()
    })

    it('rejects a member from changing roles', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            InsufficientPermissionError,
        )
    })

    it('throws MembershipNotFoundError when the membership does not exist in this organization', async () => {
        storeMock.begin.mockResolvedValue({ kind: 'not-found' })

        await expect(service.changeRole(principalFixture(), 'org-1', 'missing', 'admin')).rejects.toThrow(
            MembershipNotFoundError,
        )
    })

    it('rejects an admin who tries to grant the owner role, aborting the session', async () => {
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'owner')).rejects.toThrow(
            InsufficientPermissionError,
        )
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('rejects an admin who tries to modify an existing owner', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 2 },
            session: sessionMock,
        })
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.changeRole(actor, 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            InsufficientPermissionError,
        )
    })

    it('rejects demoting the final active owner, aborting the session', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 1 },
            session: sessionMock,
        })

        await expect(service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            FinalOwnerConflictError,
        )
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('allows demoting an owner when another active owner exists', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 2 },
            session: sessionMock,
        })

        const result = await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')

        expect(result.role).toBe('admin')
        expect(sessionMock.abort).not.toHaveBeenCalled()
    })

    it('assigns the Keycloak realm role on promotion, before completing the session', async () => {
        await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')

        expect(keycloakAdminMock.assignRealmRole).toHaveBeenCalledWith('target-subject-1', 'admin')
        expect(keycloakAdminMock.assignRealmRole.mock.invocationCallOrder[0]).toBeLessThan(
            sessionMock.changeRole.mock.invocationCallOrder[0],
        )
    })

    it('does not call Keycloak when demoting to member', async () => {
        await service.changeRole(principalFixture(), 'org-1', 'membership-1', 'member')

        expect(keycloakAdminMock.assignRealmRole).not.toHaveBeenCalled()
    })

    it('does not save local state and aborts the session when Keycloak role assignment fails', async () => {
        keycloakAdminMock.assignRealmRole.mockRejectedValue(new Error('Keycloak unavailable'))

        await expect(service.changeRole(principalFixture(), 'org-1', 'membership-1', 'admin')).rejects.toThrow(
            'Keycloak unavailable',
        )
        expect(sessionMock.changeRole).not.toHaveBeenCalled()
        expect(sessionMock.abort).toHaveBeenCalled()
    })
})
