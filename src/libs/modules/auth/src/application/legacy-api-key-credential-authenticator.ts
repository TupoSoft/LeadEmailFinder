import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key/domain/key.enum'
import { ApiKeyService } from '@tuposoft/lead-email-finder/modules/api-key/application/api-key.service'
import { CredentialAuthenticator, ExtractedCredential } from './credential-authenticator'
import { isJwtShapedToken } from './credential-extractor'
import { LegacyBridgeOrganizationResolver } from './legacy-bridge-organization-resolver.service'

export const LEGACY_API_KEY_ISSUER = 'internal:legacy-api-key'

@Injectable()
export class LegacyApiKeyCredentialAuthenticator implements CredentialAuthenticator {
    constructor(
        private readonly apiKeyService: ApiKeyService,
        private readonly legacyBridgeOrganizationResolver: LegacyBridgeOrganizationResolver,
    ) {}

    supports(credential: ExtractedCredential): boolean {
        if (credential.scheme === 'x-api-key') {
            return true
        }

        return credential.scheme === 'bearer' && !isJwtShapedToken(credential.token)
    }

    async authenticate(credential: ExtractedCredential): Promise<AuthPrincipal> {
        const key = await this.apiKeyService.findValidKey(credential.token)

        if (!key) {
            throw new UnauthorizedException('API key is invalid or expired')
        }

        const organizationId = await this.legacyBridgeOrganizationResolver.resolve()

        return {
            credentialKind: 'legacy_api_key',
            issuer: LEGACY_API_KEY_ISSUER,
            subject: key.id,
            organizationId,
            membershipRole: key.permissions.includes(KeyPermissions.ADMIN) ? 'platform_admin' : 'member',
            permissions: [],
            credentialId: key.id,
        }
    }
}
