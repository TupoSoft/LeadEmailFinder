import {
    ActiveServiceCredentialReader,
    AUTH_IDENTITY_ISSUER,
    AuthPrincipal,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialAuthenticator, CredentialRejectedError, ExtractedCredential } from './credential-authenticator'

export class ApiKeyCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly reader: ActiveServiceCredentialReader,
        private readonly hashKey: (apiKey: string) => string,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        return credential.scheme === 'bearer'
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        if (!this.supports(credential) || !/^lef_[A-Za-z0-9_-]{43}$/.test(credential.token)) {
            throw new CredentialRejectedError('API key is malformed')
        }
        const stored = await this.reader.findByKeyHash(this.hashKey(credential.token))
        if (!stored || stored.status !== 'active') {
            throw new CredentialRejectedError('API key is unknown or inactive')
        }
        return {
            credentialKind: 'service_client',
            issuer: AUTH_IDENTITY_ISSUER,
            subject: stored.id,
            credentialId: stored.id,
            organizationId: stored.organizationId,
            membershipRole: 'admin',
            permissions: stored.permissions,
        }
    }
}
