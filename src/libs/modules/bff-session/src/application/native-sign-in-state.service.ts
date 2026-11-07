import {
    ActiveMembershipReader,
    AuthRole,
    OrganizationMembershipRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthenticationUnavailableError } from './authentication-unavailable.error'
import {
    NativeHumanAuthFactsReader,
    VerifiedHumanSession,
    VerifiedHumanSessionReader,
} from './verified-human-session-reader'

export const SIGN_IN_STATES = [
    'signed_out',
    'organization_setup_required',
    'mfa_enrollment_required',
    'mfa_verification_required',
    'authenticated',
] as const

export type SignInState = (typeof SIGN_IN_STATES)[number]

export function requiresSessionMfa(role: AuthRole): boolean {
    return role === 'admin' || role === 'owner' || role === 'platform_admin'
}

export function hasCompletedSessionMfa(session: VerifiedHumanSession): boolean {
    return (
        Number.isFinite(session.mfaVerifiedAt) &&
        session.mfaVerifiedAt > 0 &&
        session.mfaVerifiedAt >= session.createdAt &&
        session.mfaVerifiedAt <= Date.now()
    )
}

/** Reject unusable memberships instead of granting setup authority to a disabled account. */
export async function readSingleNativeMembership(
    memberships: ActiveMembershipReader,
    externalIdentityId: string,
): Promise<OrganizationMembershipRecord | undefined> {
    let records: readonly OrganizationMembershipRecord[]
    try {
        records = await memberships.findForExternalIdentity(externalIdentityId)
    } catch (error) {
        if (error instanceof CredentialRejectedError) throw error
        throw new AuthenticationUnavailableError()
    }
    if (records.length === 0) return undefined

    const active = records.filter(membership => membership.status === 'active')
    if (active.length !== 1) {
        throw new CredentialRejectedError('Exactly one active organization membership is required')
    }

    return active[0]
}

export class NativeSignInStateService {
    constructor(
        private readonly sessions: VerifiedHumanSessionReader,
        private readonly memberships: ActiveMembershipReader,
        private readonly nativeFacts: NativeHumanAuthFactsReader,
    ) {}

    async read(sessionCredential?: string): Promise<{ state: SignInState }> {
        if (!sessionCredential) return { state: 'signed_out' }

        const session = await this.sessions.read(sessionCredential)
        if (!session) return { state: 'signed_out' }

        const membership = await readSingleNativeMembership(this.memberships, session.externalIdentityId)
        if (!membership) return { state: 'organization_setup_required' }

        if (!requiresSessionMfa(membership.role) || hasCompletedSessionMfa(session)) {
            return { state: 'authenticated' }
        }

        const facts = await this.nativeFacts.read(sessionCredential)
        if (!facts) return { state: 'signed_out' }

        return {
            state: facts.authenticatorEnrolled ? 'mfa_verification_required' : 'mfa_enrollment_required',
        }
    }
}
