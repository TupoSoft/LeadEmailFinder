import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { SessionRecord } from '../domain/session-record'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../infrastructure/config/bff-session-configuration'
import { RedisPendingLoginStateStore } from '../infrastructure/redis/redis-pending-login-state-store'
import { RedisSessionStore } from '../infrastructure/redis/redis-session-store'
import { HumanIdentityResolver } from './human-identity-resolver.service'
import { HumanMembershipResolver } from './human-membership-resolver.service'
import { ID_TOKEN_VERIFIER, IdTokenVerifier } from './id-token-verifier'
import { OAUTH_PROVIDER_CLIENT, OAuthProviderClient } from './oauth-provider-client'
import { computeCodeChallengeS256, generateCodeVerifier, generateCsrfToken, generateNonce, generateState } from './pkce'

export interface LoginStart {
    readonly authorizationUrl: string
    readonly state: string
}

export interface CallbackInput {
    readonly code: string
    readonly state: string
    readonly cookieState: string | undefined
    readonly existingSessionId: string | undefined
}

export interface CallbackResult {
    readonly sessionId: string
    readonly csrfToken: string
}

@Injectable()
export class BffSessionFlowService {
    constructor(
        @Inject(OAUTH_PROVIDER_CLIENT) private readonly oauthProviderClient: OAuthProviderClient,
        @Inject(ID_TOKEN_VERIFIER) private readonly idTokenVerifier: IdTokenVerifier,
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration,
        private readonly pendingLoginStateStore: RedisPendingLoginStateStore,
        private readonly sessionStore: RedisSessionStore,
        private readonly humanIdentityResolver: HumanIdentityResolver,
        private readonly humanMembershipResolver: HumanMembershipResolver,
    ) {}

    async login(): Promise<LoginStart> {
        const state = generateState()
        const nonce = generateNonce()
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = computeCodeChallengeS256(codeVerifier)
        const redirectUri = `${this.configuration.appBaseUrl}/v1/auth/callback`

        await this.pendingLoginStateStore.create(state, { nonce, codeVerifier, redirectUri, createdAt: Date.now() })

        const authorizationUrl = this.oauthProviderClient.buildAuthorizationUrl({
            redirectUri,
            state,
            nonce,
            codeChallenge,
        })

        return { authorizationUrl, state }
    }

    async handleCallback(input: CallbackInput): Promise<CallbackResult> {
        if (!input.cookieState || input.cookieState !== input.state) {
            throw new UnauthorizedException('Login state is missing or does not match the callback request')
        }

        const pending = await this.pendingLoginStateStore.consume(input.state)

        if (!pending) {
            throw new UnauthorizedException('Login state is invalid, expired, or was already used')
        }

        let tokenResponse
        try {
            tokenResponse = await this.oauthProviderClient.exchangeAuthorizationCode({
                code: input.code,
                redirectUri: pending.redirectUri,
                codeVerifier: pending.codeVerifier,
            })
        } catch {
            throw new UnauthorizedException('Authorization code exchange failed')
        }

        const verifiedIdToken = await this.idTokenVerifier.verify(tokenResponse.idToken, pending.nonce)
        const externalIdentity = await this.humanIdentityResolver.resolveOrCreate(
            verifiedIdToken.issuer,
            verifiedIdToken.subject,
            verifiedIdToken.email,
        )
        const membership = await this.humanMembershipResolver.resolveActiveForLogin(externalIdentity.id)

        const now = Date.now()
        const record: SessionRecord = {
            externalIdentityId: externalIdentity.id,
            organizationId: membership.organizationId,
            issuer: verifiedIdToken.issuer,
            subject: verifiedIdToken.subject,
            csrfToken: generateCsrfToken(),
            accessToken: tokenResponse.accessToken,
            refreshToken: tokenResponse.refreshToken,
            accessTokenExpiresAt: now + tokenResponse.accessTokenExpiresInSeconds * 1000,
            refreshTokenExpiresAt:
                tokenResponse.refreshTokenExpiresInSeconds !== null
                    ? now + tokenResponse.refreshTokenExpiresInSeconds * 1000
                    : null,
            absoluteExpiresAt: now + this.configuration.sessionAbsoluteTimeoutMs,
            createdAt: now,
        }

        if (input.existingSessionId) {
            await this.sessionStore.delete(input.existingSessionId).catch(() => undefined)
        }

        const sessionId = await this.sessionStore.create(record)

        return { sessionId, csrfToken: record.csrfToken }
    }

    async logout(sessionId: string | undefined): Promise<void> {
        if (!sessionId) {
            return
        }

        const record = await this.sessionStore.get(sessionId)

        if (!record) {
            return
        }

        await this.oauthProviderClient.revokeSession(record.refreshToken)
        await this.sessionStore.delete(sessionId)
    }
}
