import {
    ActiveMembershipReader,
    AuthRole,
    OrganizationMembershipRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthenticationUnavailableError } from './authentication-unavailable.error'
import { NativeSignInStateService } from './native-sign-in-state.service'
import {
    NativeHumanAuthFactsReader,
    VerifiedHumanSession,
    VerifiedHumanSessionReader,
} from './verified-human-session-reader'

const now = 1_800_000_000_000
const session: VerifiedHumanSession = {
    nativeUserId: 'native-human-1',
    externalIdentityId: 'identity-1',
    email: 'person@example.test',
    emailVerified: true,
    sessionId: 'native-session-1',
    createdAt: now - 60_000,
    expiresAt: now + 60_000,
    absoluteExpiresAt: now + 86_400_000,
    mfaVerifiedAt: 0,
}

function membership(role: AuthRole = 'member'): OrganizationMembershipRecord {
    return { id: 'membership-1', organizationId: 'org-1', externalIdentityId: 'identity-1', role, status: 'active' }
}

describe('NativeSignInStateService', () => {
    let sessions: jest.Mocked<VerifiedHumanSessionReader>
    let memberships: jest.Mocked<ActiveMembershipReader>
    let facts: jest.Mocked<NativeHumanAuthFactsReader>
    let service: NativeSignInStateService

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(now)
        sessions = { read: jest.fn().mockResolvedValue(session) }
        memberships = {
            findForExternalIdentity: jest.fn().mockResolvedValue([membership()]),
            findActiveForExternalIdentity: jest.fn(),
            findByOrganizationAndExternalIdentity: jest.fn(),
        }
        facts = { read: jest.fn().mockResolvedValue({ authenticatorEnrolled: false }) }
        service = new NativeSignInStateService(sessions, memberships, facts)
    })

    afterEach(() => jest.restoreAllMocks())

    it('returns signed_out without native calls when no credential is present', async () => {
        await expect(service.read()).resolves.toEqual({ state: 'signed_out' })
        expect(sessions.read).not.toHaveBeenCalled()
    })

    it('returns signed_out for an unusable native session', async () => {
        sessions.read.mockResolvedValue(undefined)
        await expect(service.read('credential')).resolves.toEqual({ state: 'signed_out' })
        expect(memberships.findForExternalIdentity).not.toHaveBeenCalled()
    })

    it('offers organization setup only to an identity with genuinely no memberships', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([])
        await expect(service.read('credential')).resolves.toEqual({ state: 'organization_setup_required' })
        expect(facts.read).not.toHaveBeenCalled()
    })

    it('rejects disabled-only memberships instead of returning setup-required state', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([{ ...membership(), status: 'disabled' }])
        await expect(service.read('credential')).rejects.toThrow(CredentialRejectedError)
    })

    it('rejects multiple active memberships', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([
            membership(),
            { ...membership(), id: 'membership-2', organizationId: 'org-2' },
        ])
        await expect(service.read('credential')).rejects.toThrow(CredentialRejectedError)
    })

    it('returns only the authenticated state for a member', async () => {
        await expect(service.read('credential')).resolves.toEqual({ state: 'authenticated' })
        expect(facts.read).not.toHaveBeenCalled()
    })

    it.each<AuthRole>(['admin', 'owner', 'platform_admin'])('routes %s to enrollment or verification', async role => {
        memberships.findForExternalIdentity.mockResolvedValue([membership(role)])
        await expect(service.read('credential')).resolves.toEqual({ state: 'mfa_enrollment_required' })
        facts.read.mockResolvedValue({ authenticatorEnrolled: true })
        await expect(service.read('credential')).resolves.toEqual({ state: 'mfa_verification_required' })
    })

    it('does not grant authenticated state because an authenticator is globally enrolled', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([membership('owner')])
        facts.read.mockResolvedValue({ authenticatorEnrolled: true })
        await expect(service.read('credential')).resolves.toEqual({ state: 'mfa_verification_required' })
    })

    it('accepts a valid session-owned MFA marker without returning it', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([membership('owner')])
        sessions.read.mockResolvedValue({ ...session, mfaVerifiedAt: now - 1_000 })
        await expect(service.read('credential')).resolves.toEqual({ state: 'authenticated' })
        expect(facts.read).not.toHaveBeenCalled()
    })

    it('handles revocation between session and factor reads as signed_out', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([membership('owner')])
        facts.read.mockResolvedValue(undefined)
        await expect(service.read('credential')).resolves.toEqual({ state: 'signed_out' })
    })

    it('does not convert persistence failures into setup authority', async () => {
        const error = new Error('database unavailable')
        memberships.findForExternalIdentity.mockRejectedValue(error)
        await expect(service.read('credential')).rejects.toThrow(AuthenticationUnavailableError)
    })
})
