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
import { MembershipRemovalService } from './membership-removal.service'

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

describe('MembershipRemovalService', () => {
    let storeMock: jest.Mocked<MembershipMutationStore>
    let sessionMock: jest.Mocked<MembershipMutationSession>
    let service: MembershipRemovalService

    beforeEach(() => {
        sessionMock = { changeRole: jest.fn(), disable: jest.fn(), abort: jest.fn() }
        storeMock = { begin: jest.fn() }
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture(), activeOwnerCount: 0 },
            session: sessionMock,
        })
        service = new MembershipRemovalService(storeMock)
    })

    it('rejects an actor outside the target organization', async () => {
        const actor = principalFixture({ organizationId: 'other-org' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(NotInOrganizationError)
        expect(storeMock.begin).not.toHaveBeenCalled()
    })

    it('rejects a member from removing anyone', async () => {
        const actor = principalFixture({ membershipRole: 'member' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(InsufficientPermissionError)
    })

    it('throws MembershipNotFoundError when the membership does not exist in this organization', async () => {
        storeMock.begin.mockResolvedValue({ kind: 'not-found' })

        await expect(service.remove(principalFixture(), 'org-1', 'missing')).rejects.toThrow(MembershipNotFoundError)
    })

    it('is an idempotent no-op when the membership is already disabled', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ status: 'disabled' }), activeOwnerCount: 0 },
            session: sessionMock,
        })

        await service.remove(principalFixture(), 'org-1', 'membership-1')

        expect(sessionMock.disable).not.toHaveBeenCalled()
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('rejects an admin who tries to remove an owner, aborting the session', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 2 },
            session: sessionMock,
        })
        const actor = principalFixture({ membershipRole: 'admin' })

        await expect(service.remove(actor, 'org-1', 'membership-1')).rejects.toThrow(InsufficientPermissionError)
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('rejects removing the final active owner, aborting the session', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 1 },
            session: sessionMock,
        })

        await expect(service.remove(principalFixture(), 'org-1', 'membership-1')).rejects.toThrow(
            FinalOwnerConflictError,
        )
        expect(sessionMock.abort).toHaveBeenCalled()
    })

    it('allows removing an owner when another active owner exists', async () => {
        storeMock.begin.mockResolvedValue({
            kind: 'ready',
            context: { membership: membershipFixture({ role: 'owner' }), activeOwnerCount: 2 },
            session: sessionMock,
        })

        await service.remove(principalFixture(), 'org-1', 'membership-1')

        expect(sessionMock.disable).toHaveBeenCalledWith(principalFixture())
        expect(sessionMock.abort).not.toHaveBeenCalled()
    })

    it('allows an owner to remove a member without any Keycloak-adjacent dependency', async () => {
        await expect(service.remove(principalFixture(), 'org-1', 'membership-1')).resolves.toBeUndefined()
        expect(sessionMock.disable).toHaveBeenCalled()
    })
})
