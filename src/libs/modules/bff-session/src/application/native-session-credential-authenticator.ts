import {
    AUTH_IDENTITY_ISSUER,
    ActiveMembershipReader,
    AuthPrincipal,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    CredentialAuthenticator,
    CredentialRejectedError,
    ExtractedCredential,
} from '@tuposoft/lead-email-finder/modules/auth'
import { hasCompletedSessionMfa, readSingleNativeMembership, requiresSessionMfa } from './native-sign-in-state.service'
import { VerifiedHumanSessionReader } from './verified-human-session-reader'

export class BffSessionCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly sessions: VerifiedHumanSessionReader,
        private readonly memberships: ActiveMembershipReader,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        return credential.scheme === 'session-cookie'
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        const session = await this.sessions.read(credential.token)
        if (!session) throw new CredentialRejectedError('Session is missing, expired, or invalid')

        const membership = await readSingleNativeMembership(this.memberships, session.externalIdentityId)
        if (!membership || (requiresSessionMfa(membership.role) && !hasCompletedSessionMfa(session))) {
            throw new CredentialRejectedError('A usable organization membership and session factors are required')
        }

        return {
            credentialKind: 'human_session',
            issuer: AUTH_IDENTITY_ISSUER,
            subject: session.nativeUserId,
            organizationId: membership.organizationId,
            membershipRole: membership.role,
            permissions: [],
            credentialId: session.externalIdentityId,
        }
    }
}
