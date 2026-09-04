import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialAuthenticator, CredentialRejectedError, ExtractedCredential } from './credential-authenticator'
import { isJwtShapedToken } from './credential-extractor'
import { OidcTokenRejectedError, OidcTokenVerifier, VerifiedOidcToken } from './oidc-token-verifier'
import { ServiceCredentialResolver } from './service-credential-resolver.service'

export class OidcCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly tokenVerifier: OidcTokenVerifier,
        private readonly serviceCredentialResolver: ServiceCredentialResolver,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        return credential.scheme === 'bearer' && isJwtShapedToken(credential.token)
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        let verifiedToken: VerifiedOidcToken
        try {
            verifiedToken = await this.tokenVerifier.verify(credential.token)
        } catch (error) {
            if (error instanceof OidcTokenRejectedError) {
                throw new CredentialRejectedError('OIDC access token is invalid')
            }

            throw error
        }

        const { issuer, subject } = verifiedToken
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
