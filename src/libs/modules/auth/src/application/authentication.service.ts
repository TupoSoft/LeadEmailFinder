import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CREDENTIAL_AUTHENTICATORS, CredentialAuthenticator } from './credential-authenticator'
import { CredentialExtractor } from './credential-extractor'

@Injectable()
export class AuthenticationService {
    constructor(
        private readonly credentialExtractor: CredentialExtractor,
        @Inject(CREDENTIAL_AUTHENTICATORS) private readonly authenticators: readonly CredentialAuthenticator[],
    ) {}

    async authenticate(headers: Record<string, string | string[] | undefined>): Promise<AuthPrincipal> {
        const credential = this.credentialExtractor.extract(headers)

        if (!credential) {
            throw new UnauthorizedException('Authentication credential is missing')
        }

        const authenticator = this.authenticators.find(candidate => candidate.supports(credential))

        if (!authenticator) {
            throw new UnauthorizedException('Authentication credential is not supported')
        }

        return await authenticator.authenticate(credential)
    }
}
