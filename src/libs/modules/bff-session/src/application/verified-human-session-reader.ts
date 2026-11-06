export const VERIFIED_HUMAN_SESSION_READER = Symbol('VERIFIED_HUMAN_SESSION_READER')
export const NATIVE_HUMAN_AUTH_FACTS_READER = Symbol('NATIVE_HUMAN_AUTH_FACTS_READER')

/** Verified server-owned facts only; credentials and native response objects remain inside the adapter. */
export interface VerifiedHumanSession {
    readonly nativeUserId: string
    readonly externalIdentityId: string
    readonly email: string
    readonly emailVerified: true
    readonly sessionId: string
    readonly createdAt: number
    readonly expiresAt: number
    readonly absoluteExpiresAt: number
    /** Epoch milliseconds. Zero means this session has not proved its second factor. */
    readonly mfaVerifiedAt: number
}

export interface VerifiedHumanSessionReader {
    read(sessionCredential: string): Promise<VerifiedHumanSession | undefined>
}

/** Enrollment alone never proves MFA for a session. */
export interface NativeHumanAuthFactsReader {
    read(sessionCredential: string): Promise<{ readonly authenticatorEnrolled: boolean } | undefined>
}
