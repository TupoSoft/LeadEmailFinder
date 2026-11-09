import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    CredentialAuthenticator,
    CredentialRejectedError,
    ExtractedCredential,
} from '@tuposoft/lead-email-finder/modules/auth'
import { HumanMembershipResolver } from './human-membership-resolver.service'
import { SessionMissingError, SessionStore } from './session-store'
import { SessionRefreshFailedError, SessionTokenRefresher } from './session-token-refresher.service'

export class BffSessionCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly sessionStore: SessionStore,
        private readonly sessionTokenRefresher: SessionTokenRefresher,
        private readonly humanMembershipResolver: HumanMembershipResolver,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        return credential.scheme === 'session-cookie'
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        const sessionId = credential.token
        const record = await this.sessionStore.get(sessionId)

        if (!record) {
            throw new CredentialRejectedError('Session is missing, expired, or invalid')
        }

        let refreshedRecord
        try {
            refreshedRecord = await this.sessionTokenRefresher.refreshIfNeeded(record)
        } catch (error) {
            if (error instanceof SessionRefreshFailedError) {
                await this.sessionStore.delete(sessionId)
                throw new CredentialRejectedError('Session could not be refreshed; sign in again')
            }
            throw error
        }

        const membership = await this.humanMembershipResolver.resolveActive(
            refreshedRecord.organizationId,
            refreshedRecord.externalIdentityId,
        )

        try {
            await this.sessionStore.save(sessionId, refreshedRecord)
        } catch (error) {
            if (error instanceof SessionMissingError) {
                throw new CredentialRejectedError('Session was replaced or expired')
            }
            throw error
        }

        return {
            credentialKind: 'human_session',
            issuer: refreshedRecord.issuer,
            subject: refreshedRecord.subject,
            organizationId: refreshedRecord.organizationId,
            membershipRole: membership.role,
            permissions: [],
            credentialId: refreshedRecord.externalIdentityId,
        }
    }
}
