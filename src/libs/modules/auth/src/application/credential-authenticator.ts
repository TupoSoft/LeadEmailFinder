import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'

export const CREDENTIAL_AUTHENTICATORS = Symbol('CREDENTIAL_AUTHENTICATORS')

export type CredentialScheme = 'bearer' | 'x-api-key'

export interface ExtractedCredential {
    readonly scheme: CredentialScheme
    readonly token: string
}

export interface CredentialAuthenticator {
    supports(credential: ExtractedCredential): boolean
    authenticate(credential: ExtractedCredential): Promise<AuthPrincipal>
}
