import {
    AUTH_IDENTITY_ISSUER,
    ActiveMembershipReader,
    AuthRole,
    OrganizationMembershipRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthenticationUnavailableError } from './authentication-unavailable.error'
import { BffSessionCredentialAuthenticator } from './native-session-credential-authenticator'
import { VerifiedHumanSession, VerifiedHumanSessionReader } from './verified-human-session-reader'

const now = 1_800_000_000_000

function session(overrides: Partial<VerifiedHumanSession> = {}): VerifiedHumanSession {
    return {
        nativeUserId: 'native-human-1',
        externalIdentityId: 'identity-1',
        email: 'person@example.test',
        emailVerified: true,
        sessionId: 'native-session-1',
        createdAt: now - 60_000,
        expiresAt: now + 60_000,
        absoluteExpiresAt: now + 86_400_000,
        mfaVerifiedAt: 0,
        ...overrides,
    }
}

function membership(role: AuthRole = 'member'): OrganizationMembershipRecord {
    return { id: 'membership-1', organizationId: 'org-1', externalIdentityId: 'identity-1', role, status: 'active' }
}

describe('BffSessionCredentialAuthenticator native sessions', () => {
    let sessions: jest.Mocked<VerifiedHumanSessionReader>
    let memberships: jest.Mocked<ActiveMembershipReader>
    let authenticator: BffSessionCredentialAuthenticator
    const credential = { scheme: 'session-cookie', token: 'signed-native-credential' } as const

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(now)
        sessions = { read: jest.fn().mockResolvedValue(session()) }
        memberships = {
            findForExternalIdentity: jest.fn().mockResolvedValue([membership()]),
            findActiveForExternalIdentity: jest.fn(),
            findByOrganizationAndExternalIdentity: jest.fn(),
        }
        authenticator = new BffSessionCredentialAuthenticator(sessions, memberships)
    })

    afterEach(() => jest.restoreAllMocks())

    it('supports only session-cookie credentials', () => {
        expect(authenticator.supports(credential)).toBe(true)
        expect(authenticator.supports({ scheme: 'bearer', token: 'api-key' })).toBe(false)
    })

    it('rejects unusable native sessions before reading membership', async () => {
        sessions.read.mockResolvedValue(undefined)
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
        expect(memberships.findForExternalIdentity).not.toHaveBeenCalled()
    })

    it('projects only native identity and local membership authority', async () => {
        await expect(authenticator.authenticate(credential)).resolves.toEqual({
            credentialKind: 'human_session',
            issuer: AUTH_IDENTITY_ISSUER,
            subject: 'native-human-1',
            organizationId: 'org-1',
            membershipRole: 'member',
            permissions: [],
            credentialId: 'identity-1',
        })
        expect(sessions.read).toHaveBeenCalledWith('signed-native-credential')
        expect(memberships.findForExternalIdentity).toHaveBeenCalledWith('identity-1')
    })

    it.each([
        [],
        [{ ...membership(), status: 'disabled' }],
        [membership(), { ...membership(), id: 'membership-2', organizationId: 'org-2' }],
    ])('rejects missing, disabled, or ambiguous memberships (%j)', async (...records) => {
        memberships.findForExternalIdentity.mockResolvedValue(records as readonly OrganizationMembershipRecord[])
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
    })

    it.each<AuthRole>(['admin', 'owner', 'platform_admin'])('requires session MFA for %s', async role => {
        memberships.findForExternalIdentity.mockResolvedValue([membership(role)])
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
        sessions.read.mockResolvedValue(session({ mfaVerifiedAt: now - 1_000 }))
        await expect(authenticator.authenticate(credential)).resolves.toMatchObject({ membershipRole: role })
    })

    it.each([now - 60_001, now + 1, NaN])('rejects an unproven or invalid MFA marker %s', async mfaVerifiedAt => {
        memberships.findForExternalIdentity.mockResolvedValue([membership('owner')])
        sessions.read.mockResolvedValue(session({ mfaVerifiedAt }))
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
    })

    it('rereads membership so promotion and disablement reject the next request', async () => {
        await expect(authenticator.authenticate(credential)).resolves.toMatchObject({ membershipRole: 'member' })
        memberships.findForExternalIdentity.mockResolvedValue([membership('admin')])
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
        memberships.findForExternalIdentity.mockResolvedValue([{ ...membership(), status: 'disabled' }])
        await expect(authenticator.authenticate(credential)).rejects.toThrow(CredentialRejectedError)
        expect(memberships.findForExternalIdentity).toHaveBeenCalledTimes(3)
    })

    it('preserves the redacted native reader infrastructure failure', async () => {
        sessions.read.mockRejectedValue(new AuthenticationUnavailableError())
        await expect(authenticator.authenticate(credential)).rejects.toThrow(AuthenticationUnavailableError)
    })

    it('maps membership infrastructure failure to redacted unavailability instead of credential rejection', async () => {
        memberships.findForExternalIdentity.mockRejectedValue(new Error('private database connection details'))
        await expect(authenticator.authenticate(credential)).rejects.toThrow(AuthenticationUnavailableError)
    })
})
