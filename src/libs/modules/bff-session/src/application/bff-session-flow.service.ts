import { ExternalIdentityResolver } from '@tuposoft/lead-email-finder/modules/identity'
import { SessionLineage } from '../domain/pending-login-state'
import { normalizeLoginDestination } from './login-destination'
import { SessionRecord } from '../domain/session-record'
import { BffSessionConfiguration } from './bff-session-configuration'
import { HumanMembershipResolver, SingleActiveMembershipRequiredError } from './human-membership-resolver.service'
import { IdTokenVerifier } from './id-token-verifier'
import { AuthorizationCodeGrantRejectedError, OAuthProviderClient } from './oauth-provider-client'
import { PendingLoginStateStore } from './pending-login-state-store'
import {
    computeCodeChallengeS256,
    generateCodeVerifier,
    generateCsrfToken,
    generateNonce,
    generateSessionId,
    generateState,
} from './pkce'
import { SessionStore } from './session-store'

export interface LoginStart {
    readonly authorizationUrl: string
    readonly state: string
    readonly clearSessionCookies: boolean
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
    readonly destination: string
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

    async login(destination?: unknown, existingSessionId?: string): Promise<LoginStart> {
        const existingSession = existingSessionId ? await this.sessionStore.get(existingSessionId) : undefined
        const sessionLineage: SessionLineage =
            existingSession && existingSessionId ? { kind: 'replace', sessionId: existingSessionId } : { kind: 'fresh' }
        const clearSessionCookies = existingSessionId !== undefined && !existingSession
        const state = generateState()
        const nonce = generateNonce()
        const codeVerifier = generateCodeVerifier()
        const codeChallenge = computeCodeChallengeS256(codeVerifier)
        const redirectUri = `${this.configuration.appBaseUrl}/v1/auth/callback`

        await this.pendingLoginStateStore.create(state, {
            nonce,
            codeVerifier,
            redirectUri,
            createdAt: Date.now(),
            sessionLineage,
            destination: normalizeLoginDestination(destination, this.configuration.appBaseUrl),
        })

        const authorizationUrl = this.oauthProviderClient.buildAuthorizationUrl({
            redirectUri,
            state,
            nonce,
            codeChallenge,
        })

        return { authorizationUrl, state, clearSessionCookies }
    }

    async handleCallback(input: CallbackInput): Promise<CallbackResult> {
        if (!input.cookieState || input.cookieState !== input.state) {
            throw new LoginStateInvalidError('Login state is missing or does not match the callback request')
        }

        const pending = await this.pendingLoginStateStore.consume(input.state)

        if (!pending) {
            throw new LoginStateInvalidError('Login state is invalid, expired, or was already used')
        }

        const lineage = pending.sessionLineage
        if (
            !lineage ||
            (lineage.kind === 'fresh' && input.existingSessionId !== undefined) ||
            (lineage.kind === 'replace' && lineage.sessionId !== input.existingSessionId) ||
            (lineage.kind !== 'fresh' && lineage.kind !== 'replace')
        ) {
            throw new LoginStateInvalidError('Session lineage no longer matches the login attempt')
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

        let sessionId: string
        if (lineage.kind === 'replace') {
            sessionId = generateSessionId()
            if (!(await this.sessionStore.replace(lineage.sessionId, sessionId, record))) {
                throw new LoginStateInvalidError('The expected session is no longer available')
            }
        } else {
            sessionId = await this.sessionStore.create(record)
        }

        return {
            sessionId,
            csrfToken: record.csrfToken,
            destination: normalizeLoginDestination(pending.destination, this.configuration.appBaseUrl),
        }
    }

    async discardSession(sessionId: string): Promise<void> {
        await this.sessionStore.delete(sessionId)
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
