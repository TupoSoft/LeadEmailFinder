import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    CredentialAuthenticator,
    ExtractedCredential,
} from '@tuposoft/lead-email-finder/modules/auth/application/credential-authenticator'
import { RedisSessionStore } from '../infrastructure/redis/redis-session-store'
import { HumanMembershipResolver } from './human-membership-resolver.service'
import { SessionRefreshFailedError, SessionTokenRefresher } from './session-token-refresher.service'

@Injectable()
export class BffSessionCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly sessionStore: RedisSessionStore,
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
            throw new UnauthorizedException('Session is missing, expired, or invalid')
        }

        let refreshedRecord
        try {
            refreshedRecord = await this.sessionTokenRefresher.refreshIfNeeded(record)
        } catch (error) {
            if (error instanceof SessionRefreshFailedError) {
                await this.sessionStore.delete(sessionId)
                throw new UnauthorizedException('Session could not be refreshed; sign in again')
            }
            throw error
        }

        const membership = await this.humanMembershipResolver.resolveActive(
            refreshedRecord.organizationId,
            refreshedRecord.externalIdentityId,
        )

        await this.sessionStore.save(sessionId, refreshedRecord)

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
