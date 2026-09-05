import { ExternalIdentityResolver } from '@tuposoft/lead-email-finder/modules/identity'
import { SessionRecord } from '../domain/session-record'
import { BffSessionConfiguration } from './bff-session-configuration'
import { HumanMembershipResolver, SingleActiveMembershipRequiredError } from './human-membership-resolver.service'
import { IdTokenVerifier } from './id-token-verifier'
import { AuthorizationCodeGrantRejectedError, OAuthProviderClient } from './oauth-provider-client'
import { PendingLoginStateStore } from './pending-login-state-store'
import { computeCodeChallengeS256, generateCodeVerifier, generateCsrfToken, generateNonce, generateState } from './pkce'
import { SessionStore } from './session-store'

export interface LoginStart {
    readonly authorizationUrl: string
    readonly state: string
}

export interface CallbackInput {
    readonly code: string | undefined
    readonly state: string
    readonly cookieState: string | undefined
    readonly existingSessionId: string | undefined
}

export interface CallbackResult {
    readonly sessionId: string
    readonly csrfToken: string
}

export class LoginStateInvalidError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LoginStateInvalidError'
    }
}

export class AuthorizationCodeExchangeFailedError extends Error {
    constructor() {
        super('Authorization code exchange failed')
        this.name = 'AuthorizationCodeExchangeFailedError'
    }
}

export class BffSessionFlowService {
    constructor(
        private readonly oauthProviderClient: OAuthProviderClient,
        private readonly idTokenVerifier: IdTokenVerifier,
        private readonly configuration: BffSessionConfiguration,
        private readonly pendingLoginStateStore: PendingLoginStateStore,
        private readonly sessionStore: SessionStore,
        private readonly externalIdentityResolver: ExternalIdentityResolver,
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
            throw new LoginStateInvalidError('Login state is missing or does not match the callback request')
        }

        const pending = await this.pendingLoginStateStore.consume(input.state)

        if (!pending) {
            throw new LoginStateInvalidError('Login state is invalid, expired, or was already used')
        }

        if (typeof input.code !== 'string' || input.code.trim().length === 0) {
            throw new AuthorizationCodeExchangeFailedError()
        }

        let tokenResponse
        try {
            tokenResponse = await this.oauthProviderClient.exchangeAuthorizationCode({
                code: input.code,
                redirectUri: pending.redirectUri,
                codeVerifier: pending.codeVerifier,
            })
        } catch (error) {
            if (error instanceof AuthorizationCodeGrantRejectedError) {
                throw new AuthorizationCodeExchangeFailedError()
            }

            throw error
        }

        const verifiedIdToken = await this.idTokenVerifier.verify(tokenResponse.idToken, pending.nonce)
        const externalIdentity = await this.externalIdentityResolver.findExisting(
            verifiedIdToken.issuer,
            verifiedIdToken.subject,
        )
        if (!externalIdentity) {
            throw new SingleActiveMembershipRequiredError()
        }

        const membership = await this.humanMembershipResolver.resolveActiveForLogin(externalIdentity.id)
        const synchronizedIdentity = await this.externalIdentityResolver.synchronizeEmail(
            externalIdentity,
            verifiedIdToken.email,
        )

        const now = Date.now()
        const record: SessionRecord = {
            externalIdentityId: synchronizedIdentity.id,
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
