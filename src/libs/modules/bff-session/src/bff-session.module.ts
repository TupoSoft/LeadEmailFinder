import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
    BETTER_AUTH_RUNTIME,
    BetterAuthRuntime,
    BetterAuthRuntimeModule,
} from '@tuposoft/lead-email-finder/better-auth'
import {
    ACTIVE_MEMBERSHIP_READER,
    CURRENT_ACCOUNT_READER,
    ActiveMembershipReader,
    CurrentAccountReader,
    IdentityModule,
    ExternalIdentityResolver,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthModule,
    SERVICE_CLIENT_GRANT_POLICY,
    ServiceClientGrantPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BFF_SESSION_CONFIGURATION, BrowserSessionConfiguration } from './application/bff-session-configuration'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { BrowserCapabilityPolicy } from './application/browser-capability-policy'
import { CurrentAccountService } from './application/current-account.service'
import { NativeSignInStateService } from './application/native-sign-in-state.service'
import {
    NATIVE_HUMAN_AUTH_FACTS_READER,
    NativeHumanAuthFactsReader,
    VERIFIED_HUMAN_SESSION_READER,
    VerifiedHumanSessionReader,
} from './application/verified-human-session-reader'
import { createNativeBrowserSessionConfiguration } from './infrastructure/config/bff-session-configuration'
import {
    NativeHumanAuthFactsReaderAdapter,
    NativeVerifiedHumanSessionReader,
} from './infrastructure/native/native-verified-human-session-reader'
import { BffSessionController } from './api/bff-session.controller'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { CsrfGuard } from './api/csrf.guard'
import { OriginGuard } from './api/origin.guard'

@Module({
    imports: [ConfigModule, IdentityModule, AuthModule, BetterAuthRuntimeModule],
    controllers: [BffSessionController],
    providers: [
        {
            provide: BFF_SESSION_CONFIGURATION,
            useFactory: createNativeBrowserSessionConfiguration,
            inject: [ConfigService],
        },
        {
            provide: NativeVerifiedHumanSessionReader,
            useFactory: (
                runtime: BetterAuthRuntime,
                identities: ExternalIdentityResolver,
                configuration: BrowserSessionConfiguration,
            ) => new NativeVerifiedHumanSessionReader(runtime, identities, configuration),
            inject: [BETTER_AUTH_RUNTIME, ExternalIdentityResolver, BFF_SESSION_CONFIGURATION],
        },
        { provide: VERIFIED_HUMAN_SESSION_READER, useExisting: NativeVerifiedHumanSessionReader },
        {
            provide: NATIVE_HUMAN_AUTH_FACTS_READER,
            useFactory: (reader: NativeVerifiedHumanSessionReader) => new NativeHumanAuthFactsReaderAdapter(reader),
            inject: [NativeVerifiedHumanSessionReader],
        },
        {
            provide: NativeSignInStateService,
            useFactory: (
                sessions: VerifiedHumanSessionReader,
                memberships: ActiveMembershipReader,
                facts: NativeHumanAuthFactsReader,
            ) => new NativeSignInStateService(sessions, memberships, facts),
            inject: [VERIFIED_HUMAN_SESSION_READER, ACTIVE_MEMBERSHIP_READER, NATIVE_HUMAN_AUTH_FACTS_READER],
        },
        BrowserCapabilityPolicy,
        {
            provide: CurrentAccountService,
            useFactory: (
                reader: CurrentAccountReader,
                capabilities: BrowserCapabilityPolicy,
                grants: ServiceClientGrantPolicy,
            ) => new CurrentAccountService(reader, capabilities, grants),
            inject: [CURRENT_ACCOUNT_READER, BrowserCapabilityPolicy, SERVICE_CLIENT_GRANT_POLICY],
        },
        {
            provide: BffSessionCredentialAuthenticator,
            useFactory: (sessions: VerifiedHumanSessionReader, memberships: ActiveMembershipReader) =>
                new BffSessionCredentialAuthenticator(sessions, memberships),
            inject: [VERIFIED_HUMAN_SESSION_READER, ACTIVE_MEMBERSHIP_READER],
        },
        OriginGuard,
        CsrfGuard,
        BrowserSessionMutationGuard,
    ],
    exports: [BffSessionCredentialAuthenticator, BrowserSessionMutationGuard, VERIFIED_HUMAN_SESSION_READER],
})
export class BffSessionModule {}
