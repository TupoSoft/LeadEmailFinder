import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialAuthenticator, CredentialRejectedError } from './credential-authenticator'
import { CredentialExtractor } from './credential-extractor'

export class AuthenticationService {
    constructor(
        private readonly credentialExtractor: CredentialExtractor,
        private readonly authenticators: readonly CredentialAuthenticator[],
    ) {}

    async authenticate(headers: Record<string, string | string[] | undefined>): Promise<AuthPrincipal> {
        const credential = this.credentialExtractor.extract(headers)

        if (!credential) {
            throw new CredentialRejectedError('Authentication credential is missing')
        }

        const authenticator = this.authenticators.find(candidate => candidate.supports(credential))

        if (!authenticator) {
            throw new CredentialRejectedError('Authentication credential is not supported')
        }

        return await authenticator.authenticate(credential)
    }
}
