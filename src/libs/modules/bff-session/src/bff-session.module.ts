import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
    ACTIVE_MEMBERSHIP_READER,
    ActiveMembershipReader,
    ExternalIdentityResolver,
    IdentityModule,
} from '@tuposoft/lead-email-finder/modules/identity'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './application/bff-session-configuration'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { HumanMembershipResolver } from './application/human-membership-resolver.service'
import { ID_TOKEN_VERIFIER, IdTokenVerifier } from './application/id-token-verifier'
import { OAUTH_PROVIDER_CLIENT, OAuthProviderClient } from './application/oauth-provider-client'
import { PENDING_LOGIN_STATE_STORE, PendingLoginStateStore } from './application/pending-login-state-store'
import { SESSION_STORE, SessionStore } from './application/session-store'
import { SessionTokenRefresher } from './application/session-token-refresher.service'
import { createBffSessionConfiguration } from './infrastructure/config/bff-session-configuration'
import { SESSION_ENCRYPTION_KEY, SessionEncryptor } from './infrastructure/crypto/session-encryptor'
import { JoseIdTokenVerifier } from './infrastructure/jose/jose-id-token-verifier'
import { KeycloakOAuthClient } from './infrastructure/keycloak/keycloak-oauth-client'
import { RedisPendingLoginStateStore } from './infrastructure/redis/redis-pending-login-state-store'
import { RedisSessionStore } from './infrastructure/redis/redis-session-store'
import { BffSessionController } from './api/bff-session.controller'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { CsrfGuard } from './api/csrf.guard'
import { OriginGuard } from './api/origin.guard'

@Module({
    imports: [ConfigModule, IdentityModule],
    controllers: [BffSessionController],
    providers: [
        {
            provide: BFF_SESSION_CONFIGURATION,
            useFactory: createBffSessionConfiguration,
            inject: [ConfigService],
        },
        {
            provide: SESSION_ENCRYPTION_KEY,
            useFactory: (configService: ConfigService) => configService.getOrThrow<string>('SESSION_ENCRYPTION_KEY'),
            inject: [ConfigService],
        },
        { provide: OAUTH_PROVIDER_CLIENT, useClass: KeycloakOAuthClient },
        { provide: ID_TOKEN_VERIFIER, useClass: JoseIdTokenVerifier },
        SessionEncryptor,
        RedisSessionStore,
        RedisPendingLoginStateStore,
        { provide: SESSION_STORE, useExisting: RedisSessionStore },
        { provide: PENDING_LOGIN_STATE_STORE, useExisting: RedisPendingLoginStateStore },
        {
            provide: SessionTokenRefresher,
            useFactory: (oauthProviderClient: OAuthProviderClient) => new SessionTokenRefresher(oauthProviderClient),
            inject: [OAUTH_PROVIDER_CLIENT],
        },
        {
            provide: HumanMembershipResolver,
            useFactory: (reader: ActiveMembershipReader) => new HumanMembershipResolver(reader),
            inject: [ACTIVE_MEMBERSHIP_READER],
        },
        {
            provide: BffSessionFlowService,
            useFactory: (
                oauthProviderClient: OAuthProviderClient,
                idTokenVerifier: IdTokenVerifier,
                configuration: BffSessionConfiguration,
                pendingLoginStateStore: PendingLoginStateStore,
                sessionStore: SessionStore,
                externalIdentityResolver: ExternalIdentityResolver,
                humanMembershipResolver: HumanMembershipResolver,
            ) =>
                new BffSessionFlowService(
                    oauthProviderClient,
                    idTokenVerifier,
                    configuration,
                    pendingLoginStateStore,
                    sessionStore,
                    externalIdentityResolver,
                    humanMembershipResolver,
                ),
            inject: [
                OAUTH_PROVIDER_CLIENT,
                ID_TOKEN_VERIFIER,
                BFF_SESSION_CONFIGURATION,
                PENDING_LOGIN_STATE_STORE,
                SESSION_STORE,
                ExternalIdentityResolver,
                HumanMembershipResolver,
            ],
        },
        {
            provide: BffSessionCredentialAuthenticator,
            useFactory: (
                sessionStore: SessionStore,
                sessionTokenRefresher: SessionTokenRefresher,
                humanMembershipResolver: HumanMembershipResolver,
            ) => new BffSessionCredentialAuthenticator(sessionStore, sessionTokenRefresher, humanMembershipResolver),
            inject: [SESSION_STORE, SessionTokenRefresher, HumanMembershipResolver],
        },
        OriginGuard,
        CsrfGuard,
        BrowserSessionMutationGuard,
    ],
    exports: [BffSessionCredentialAuthenticator, BrowserSessionMutationGuard],
})
export class BffSessionModule {}
