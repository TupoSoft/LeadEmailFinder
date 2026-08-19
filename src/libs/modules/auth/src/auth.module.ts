import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionModule } from '@tuposoft/lead-email-finder/modules/bff-session/bff-session.module'
import { BffSessionCredentialAuthenticator } from '@tuposoft/lead-email-finder/modules/bff-session/application/bff-session-credential-authenticator'
import { AuthenticationService } from './application/authentication.service'
import { CREDENTIAL_AUTHENTICATORS } from './application/credential-authenticator'
import { CredentialExtractor } from './application/credential-extractor'
import { OidcCredentialAuthenticator } from './application/oidc-credential-authenticator'
import { OIDC_TOKEN_VERIFIER } from './application/oidc-token-verifier'
import { ServiceCredentialResolver } from './application/service-credential-resolver.service'
import { AuthGuard } from './infrastructure/http/auth.guard'
import { JoseOidcTokenVerifier } from './infrastructure/jose/jose-oidc-token-verifier'
import { createOidcConfiguration, OIDC_CONFIGURATION } from './infrastructure/jose/oidc-configuration'

@Module({
    imports: [ConfigModule, IdentityModule, BffSessionModule],
    providers: [
        CredentialExtractor,
        AuthenticationService,
        ServiceCredentialResolver,
        OidcCredentialAuthenticator,
        { provide: OIDC_CONFIGURATION, useFactory: createOidcConfiguration, inject: [ConfigService] },
        { provide: OIDC_TOKEN_VERIFIER, useClass: JoseOidcTokenVerifier },
        {
            provide: CREDENTIAL_AUTHENTICATORS,
            useFactory: (oidc: OidcCredentialAuthenticator, bffSession: BffSessionCredentialAuthenticator) => [
                oidc,
                bffSession,
            ],
            inject: [OidcCredentialAuthenticator, BffSessionCredentialAuthenticator],
        },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
    exports: [AuthenticationService],
})
export class AuthModule {}
