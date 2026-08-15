import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyService } from '@tuposoft/lead-email-finder/modules/api-key/application/api-key.service'
import { Key } from '@tuposoft/lead-email-finder/modules/api-key/models/key.entity'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from './application/authentication.service'
import { CREDENTIAL_AUTHENTICATORS } from './application/credential-authenticator'
import { CredentialExtractor } from './application/credential-extractor'
import { LegacyApiKeyCredentialAuthenticator } from './application/legacy-api-key-credential-authenticator'
import { LegacyBridgeOrganizationResolver } from './application/legacy-bridge-organization-resolver.service'
import { OidcCredentialAuthenticator } from './application/oidc-credential-authenticator'
import { OIDC_TOKEN_VERIFIER } from './application/oidc-token-verifier'
import { ServiceCredentialResolver } from './application/service-credential-resolver.service'
import { AuthGuard } from './infrastructure/http/auth.guard'
import { JoseOidcTokenVerifier } from './infrastructure/jose/jose-oidc-token-verifier'
import { createOidcConfiguration, OIDC_CONFIGURATION } from './infrastructure/jose/oidc-configuration'

// Provides its own Key repository/ApiKeyService instead of importing ApiKeyModule: ApiKeyModule's own
// controller depends on this module for PermissionsGuard, so importing ApiKeyModule here would cycle back.
@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([Key]), IdentityModule],
    providers: [
        CredentialExtractor,
        AuthenticationService,
        ApiKeyService,
        ServiceCredentialResolver,
        OidcCredentialAuthenticator,
        LegacyBridgeOrganizationResolver,
        LegacyApiKeyCredentialAuthenticator,
        { provide: OIDC_CONFIGURATION, useFactory: createOidcConfiguration, inject: [ConfigService] },
        { provide: OIDC_TOKEN_VERIFIER, useClass: JoseOidcTokenVerifier },
        {
            provide: CREDENTIAL_AUTHENTICATORS,
            useFactory: (oidc: OidcCredentialAuthenticator, legacy: LegacyApiKeyCredentialAuthenticator) => [
                oidc,
                legacy,
            ],
            inject: [OidcCredentialAuthenticator, LegacyApiKeyCredentialAuthenticator],
        },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
    exports: [AuthenticationService],
})
export class AuthModule {}
