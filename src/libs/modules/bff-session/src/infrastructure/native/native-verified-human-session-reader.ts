import {
    BetterAuthRuntime,
    nativeSessionCookieEffects,
    nativeSessionCookieName,
} from '@tuposoft/lead-email-finder/better-auth'
import { AUTH_IDENTITY_ISSUER, ExternalIdentityResolver } from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { AuthenticationUnavailableError } from '../../application/authentication-unavailable.error'
import {
    NativeHumanAuthFactsReader,
    VerifiedHumanSession,
    VerifiedHumanSessionReader,
} from '../../application/verified-human-session-reader'

interface NativeSessionFacts {
    readonly nativeUserId: string
    readonly email: string
    readonly sessionId: string
    readonly createdAt: number
    readonly expiresAt: number
    readonly absoluteExpiresAt: number
    readonly authenticatorEnrolled: boolean
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonblankString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function epoch(value: unknown): number {
    return typeof value === 'string' ? Date.parse(value) : NaN
}

/** Calls only the native server API; neither headers nor native records cross the application boundary. */
export class NativeVerifiedHumanSessionReader implements VerifiedHumanSessionReader {
    constructor(
        private readonly runtime: Pick<BetterAuthRuntime, 'auth'>,
        private readonly identities: ExternalIdentityResolver,
        private readonly configuration: Pick<BffSessionConfiguration, 'appBaseUrl' | 'sessionAbsoluteTimeoutMs'>,
    ) {}

    async read(sessionCredential: string): Promise<VerifiedHumanSession | undefined> {
        try {
            const facts = await this.readNativeFacts(sessionCredential)
            if (!facts) return undefined

            const identity = await this.identities.resolveOrCreate(
                AUTH_IDENTITY_ISSUER,
                facts.nativeUserId,
                facts.email,
            )

            return {
                nativeUserId: facts.nativeUserId,
                externalIdentityId: identity.id,
                email: facts.email,
                emailVerified: true,
                sessionId: facts.sessionId,
                createdAt: facts.createdAt,
                expiresAt: facts.expiresAt,
                absoluteExpiresAt: facts.absoluteExpiresAt,
                // No session can prove MFA until the server-owned completion workflow is implemented.
                mfaVerifiedAt: 0,
            }
        } catch {
            throw new AuthenticationUnavailableError()
        }
    }

    async readAuthFacts(sessionCredential: string): Promise<{ authenticatorEnrolled: boolean } | undefined> {
        try {
            const facts = await this.readNativeFacts(sessionCredential)
            return facts ? { authenticatorEnrolled: facts.authenticatorEnrolled } : undefined
        } catch {
            throw new AuthenticationUnavailableError()
        }
    }

    private async readNativeFacts(sessionCredential: string): Promise<NativeSessionFacts | undefined> {
        if (!sessionCredential) return undefined

        const cookie = `${nativeSessionCookieName(this.configuration.appBaseUrl)}=${encodeURIComponent(sessionCredential)}`
        const response = await this.runtime.auth.api.getSession({
            headers: new Headers({ cookie }),
            query: { disableCookieCache: true },
            asResponse: true,
        })
        nativeSessionCookieEffects.capture(response.headers)

        if (response.status === 401) return undefined
        if (!response.ok) throw new AuthenticationUnavailableError()

        const value: unknown = await response.json()
        if (value === null) return undefined
        if (!record(value) || !record(value.session) || !record(value.user)) {
            throw new AuthenticationUnavailableError()
        }

        const { session, user } = value
        const createdAt = epoch(session.createdAt)
        const expiresAt = epoch(session.expiresAt)
        const absoluteExpiresAt = createdAt + this.configuration.sessionAbsoluteTimeoutMs
        const now = Date.now()
        if (
            !nonblankString(user.id) ||
            !nonblankString(user.email) ||
            user.emailVerified !== true ||
            !nonblankString(session.id) ||
            session.userId !== user.id ||
            !Number.isFinite(createdAt) ||
            createdAt > now ||
            !Number.isFinite(expiresAt) ||
            !Number.isFinite(absoluteExpiresAt) ||
            createdAt >= expiresAt ||
            expiresAt <= now ||
            absoluteExpiresAt <= now
        )
            return undefined

        return {
            nativeUserId: user.id,
            email: user.email,
            sessionId: session.id,
            createdAt,
            expiresAt,
            absoluteExpiresAt,
            authenticatorEnrolled: user.twoFactorEnabled === true,
        }
    }
}

export class NativeHumanAuthFactsReaderAdapter implements NativeHumanAuthFactsReader {
    constructor(private readonly sessions: NativeVerifiedHumanSessionReader) {}

    read(sessionCredential: string): Promise<{ authenticatorEnrolled: boolean } | undefined> {
        return this.sessions.readAuthFacts(sessionCredential)
    }
}
