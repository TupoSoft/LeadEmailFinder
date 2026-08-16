import { Inject, Injectable } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialAuthenticator, ExtractedCredential } from './credential-authenticator'
import { isJwtShapedToken } from './credential-extractor'
import { OIDC_TOKEN_VERIFIER, OidcTokenVerifier } from './oidc-token-verifier'
import { ServiceCredentialResolver } from './service-credential-resolver.service'

@Injectable()
export class OidcCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        @Inject(OIDC_TOKEN_VERIFIER) private readonly tokenVerifier: OidcTokenVerifier,
        private readonly serviceCredentialResolver: ServiceCredentialResolver,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        return credential.scheme === 'bearer' && isJwtShapedToken(credential.token)
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        const { issuer, subject } = await this.tokenVerifier.verify(credential.token)
        const serviceCredential = await this.serviceCredentialResolver.resolveActive(issuer, subject)

        return {
            credentialKind: 'service_client',
            issuer,
            subject,
            organizationId: serviceCredential.organizationId,
            membershipRole: 'admin',
            permissions: serviceCredential.permissions,
            credentialId: serviceCredential.id,
        }
    }
}
