import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import {
    AuthenticationService,
    AuthGuard,
    AuthModule,
    CredentialExtractor,
    ApiKeyCredentialAuthenticator,
} from '@tuposoft/lead-email-finder/modules/auth'
import {
    BffSessionCredentialAuthenticator,
    BffSessionModule,
    BrowserSessionMutationGuard,
} from '@tuposoft/lead-email-finder/modules/bff-session'

/**
 * The single composition root for bearer and browser-session authentication. Auth and BFF session are each
 * self-contained business modules with no dependency on one another; this host-level module is the only place
 * that assembles both authenticators and installs the two global guards, in the order authentication must run
 * before the browser-session mutation check.
 */
@Module({
    imports: [AuthModule, BffSessionModule],
    providers: [
        {
            provide: AuthenticationService,
            useFactory: (
                credentialExtractor: CredentialExtractor,
                apiKeyCredentialAuthenticator: ApiKeyCredentialAuthenticator,
                bffSessionCredentialAuthenticator: BffSessionCredentialAuthenticator,
            ) =>
                new AuthenticationService(credentialExtractor, [
                    apiKeyCredentialAuthenticator,
                    bffSessionCredentialAuthenticator,
                ]),
            inject: [CredentialExtractor, ApiKeyCredentialAuthenticator, BffSessionCredentialAuthenticator],
        },
        AuthGuard,
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: APP_GUARD, useExisting: BrowserSessionMutationGuard },
    ],
    exports: [AuthenticationService],
})
export class AuthenticationCompositionModule {}
