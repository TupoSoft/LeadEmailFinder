import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
    ACTIVE_SERVICE_CREDENTIAL_READER,
    ActiveServiceCredentialReader,
    IdentityModule,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialExtractor } from './application/credential-extractor'
import { OidcCredentialAuthenticator } from './application/oidc-credential-authenticator'
import { OIDC_TOKEN_VERIFIER, OidcTokenVerifier } from './application/oidc-token-verifier'
import { ServiceCredentialResolver } from './application/service-credential-resolver.service'
import { JoseOidcTokenVerifier } from './infrastructure/jose/jose-oidc-token-verifier'
import { createOidcConfiguration, OIDC_CONFIGURATION } from './infrastructure/jose/oidc-configuration'

@Module({
    imports: [ConfigModule, IdentityModule],
    providers: [
        { provide: CredentialExtractor, useFactory: () => new CredentialExtractor() },
        {
            provide: ServiceCredentialResolver,
            useFactory: (reader: ActiveServiceCredentialReader) => new ServiceCredentialResolver(reader),
            inject: [ACTIVE_SERVICE_CREDENTIAL_READER],
        },
        { provide: OIDC_CONFIGURATION, useFactory: createOidcConfiguration, inject: [ConfigService] },
        { provide: OIDC_TOKEN_VERIFIER, useClass: JoseOidcTokenVerifier },
        {
            provide: OidcCredentialAuthenticator,
            useFactory: (tokenVerifier: OidcTokenVerifier, serviceCredentialResolver: ServiceCredentialResolver) =>
                new OidcCredentialAuthenticator(tokenVerifier, serviceCredentialResolver),
            inject: [OIDC_TOKEN_VERIFIER, ServiceCredentialResolver],
        },
    ],
    exports: [CredentialExtractor, OidcCredentialAuthenticator],
})
export class AuthModule {}
