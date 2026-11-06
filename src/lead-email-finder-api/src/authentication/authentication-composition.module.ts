import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { nativeSessionCookieName } from '@tuposoft/lead-email-finder/better-auth'
import { BrowserAuthGuard } from './browser-auth.guard'
import {
    AuthenticationService,
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
    imports: [ConfigModule, AuthModule, BffSessionModule],
    providers: [
        {
            provide: CredentialExtractor,
            useFactory: (configuration: ConfigService) =>
                new CredentialExtractor(nativeSessionCookieName(configuration.getOrThrow<string>('APP_BASE_URL'))),
            inject: [ConfigService],
        },
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
        BrowserAuthGuard,
        { provide: APP_GUARD, useExisting: BrowserAuthGuard },
        { provide: APP_GUARD, useExisting: BrowserSessionMutationGuard },
    ],
    exports: [AuthenticationService],
})
export class AuthenticationCompositionModule {}
