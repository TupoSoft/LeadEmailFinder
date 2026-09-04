import { MODULE_METADATA } from '@nestjs/common/constants'
import {
    ACTIVE_MEMBERSHIP_READER,
    CURRENT_ACCOUNT_READER,
    ExternalIdentityResolver,
} from '@tuposoft/lead-email-finder/modules/identity'
import { AuthModule, SERVICE_CLIENT_GRANT_POLICY } from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionModule } from './bff-session.module'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BrowserCapabilityPolicy } from './application/browser-capability-policy'
import { CurrentAccountService } from './application/current-account.service'
import { HumanMembershipResolver } from './application/human-membership-resolver.service'
import { PENDING_LOGIN_STATE_STORE } from './application/pending-login-state-store'
import { SESSION_STORE } from './application/session-store'
import { RedisPendingLoginStateStore } from './infrastructure/redis/redis-pending-login-state-store'
import { RedisSessionStore } from './infrastructure/redis/redis-session-store'

describe('BffSessionModule', () => {
    it('binds the session and pending-login-state ports to their Redis adapters', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BffSessionModule) as Array<{
            provide?: unknown
            useExisting?: unknown
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: SESSION_STORE, useExisting: RedisSessionStore }),
                expect.objectContaining({
                    provide: PENDING_LOGIN_STATE_STORE,
                    useExisting: RedisPendingLoginStateStore,
                }),
            ]),
        )
    })

    it('constructs the framework-free application classes via explicit factories', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BffSessionModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: HumanMembershipResolver, inject: [ACTIVE_MEMBERSHIP_READER] }),
                expect.objectContaining({
                    provide: CurrentAccountService,
                    inject: [CURRENT_ACCOUNT_READER, BrowserCapabilityPolicy, SERVICE_CLIENT_GRANT_POLICY],
                }),
                expect.objectContaining({ provide: BffSessionFlowService }),
                expect.objectContaining({ provide: BffSessionCredentialAuthenticator }),
            ]),
        )
        const flowServiceProvider = providers.find(provider => provider.provide === BffSessionFlowService)
        expect(flowServiceProvider?.inject).toContain(ExternalIdentityResolver)
        expect(flowServiceProvider?.inject).toContain(HumanMembershipResolver)
    })

    it('imports auth so the shared service-client grant policy is injectable', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, BffSessionModule) as unknown[]

        expect(imports).toContain(AuthModule)
    })

    it('exports only the credential authenticator and the browser mutation guard', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BffSessionModule) as unknown[]

        expect(exports).toHaveLength(2)
        expect(exports).toEqual(expect.arrayContaining([BffSessionCredentialAuthenticator]))
    })
})
