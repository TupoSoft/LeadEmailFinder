import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { HumanMembershipResolver } from './application/human-membership-resolver.service'
import { ID_TOKEN_VERIFIER } from './application/id-token-verifier'
import { OAUTH_PROVIDER_CLIENT } from './application/oauth-provider-client'
import { SessionTokenRefresher } from './application/session-token-refresher.service'
import {
    BFF_SESSION_CONFIGURATION,
    createBffSessionConfiguration,
} from './infrastructure/config/bff-session-configuration'
import { SESSION_ENCRYPTION_KEY, SessionEncryptor } from './infrastructure/crypto/session-encryptor'
import { JoseIdTokenVerifier } from './infrastructure/jose/jose-id-token-verifier'
import { KeycloakOAuthClient } from './infrastructure/keycloak/keycloak-oauth-client'
import { BffSessionController } from './infrastructure/http/bff-session.controller'
import { BrowserSessionMutationGuard } from './infrastructure/http/browser-session-mutation.guard'
import { CsrfGuard } from './infrastructure/http/csrf.guard'
import { OriginGuard } from './infrastructure/http/origin.guard'
import { RedisPendingLoginStateStore } from './infrastructure/redis/redis-pending-login-state-store'
import { RedisSessionStore } from './infrastructure/redis/redis-session-store'

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
        HumanMembershipResolver,
        SessionTokenRefresher,
        BffSessionFlowService,
        BffSessionCredentialAuthenticator,
        OriginGuard,
        CsrfGuard,
        BrowserSessionMutationGuard,
    ],
    exports: [BffSessionCredentialAuthenticator, BrowserSessionMutationGuard],
})
export class BffSessionModule {}
