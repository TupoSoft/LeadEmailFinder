import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

export const CREDENTIAL_AUTHENTICATORS = Symbol('CREDENTIAL_AUTHENTICATORS')

export type CredentialScheme = 'bearer' | 'session-cookie'

export interface ExtractedCredential {
    readonly scheme: CredentialScheme
    readonly token: string
}

export interface CredentialAuthenticator {
    supports(credential: ExtractedCredential): boolean
    authenticate(credential: ExtractedCredential): Promise<AuthPrincipal>
}

/**
 * Framework-free signal that a credential was rejected (missing, unsupported, expired, disabled, or unknown).
 * The API boundary (AuthGuard) translates every instance of this into a 401. Thrown by any authenticator in
 * the chain, including ones defined in other modules (e.g. bff-session), so that AuthGuard never needs to know
 * about authenticator-specific error types.
 */
export class CredentialRejectedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'CredentialRejectedError'
    }
}
