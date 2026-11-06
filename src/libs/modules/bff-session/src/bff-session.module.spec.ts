import { MODULE_METADATA } from '@nestjs/common/constants'
import { BetterAuthRuntimeModule } from '@tuposoft/lead-email-finder/better-auth'
import { ACTIVE_MEMBERSHIP_READER, CURRENT_ACCOUNT_READER } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthModule, SERVICE_CLIENT_GRANT_POLICY } from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionModule } from './bff-session.module'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { BrowserCapabilityPolicy } from './application/browser-capability-policy'
import { CurrentAccountService } from './application/current-account.service'
import { NativeSignInStateService } from './application/native-sign-in-state.service'
import {
    NATIVE_HUMAN_AUTH_FACTS_READER,
    VERIFIED_HUMAN_SESSION_READER,
} from './application/verified-human-session-reader'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { NativeVerifiedHumanSessionReader } from './infrastructure/native/native-verified-human-session-reader'
import { SESSION_STORE } from './application/session-store'
import { PENDING_LOGIN_STATE_STORE } from './application/pending-login-state-store'

describe('BffSessionModule native composition', () => {
    it('binds the verified session capability to the singleton runtime adapter without legacy Redis stores', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BffSessionModule) as Array<{
            provide?: unknown
            useExisting?: unknown
        }>
        expect(providers).toContainEqual({
            provide: VERIFIED_HUMAN_SESSION_READER,
            useExisting: NativeVerifiedHumanSessionReader,
        })
        expect(providers.find(provider => provider.provide === SESSION_STORE)).toBeUndefined()
        expect(providers.find(provider => provider.provide === PENDING_LOGIN_STATE_STORE)).toBeUndefined()
    })

    it('injects only application contracts into native account and principal policies', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BffSessionModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>
        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    provide: CurrentAccountService,
                    inject: [CURRENT_ACCOUNT_READER, BrowserCapabilityPolicy, SERVICE_CLIENT_GRANT_POLICY],
                }),
                expect.objectContaining({
                    provide: NativeSignInStateService,
                    inject: [VERIFIED_HUMAN_SESSION_READER, ACTIVE_MEMBERSHIP_READER, NATIVE_HUMAN_AUTH_FACTS_READER],
                }),
                expect.objectContaining({
                    provide: BffSessionCredentialAuthenticator,
                    inject: [VERIFIED_HUMAN_SESSION_READER, ACTIVE_MEMBERSHIP_READER],
                }),
            ]),
        )
    })

    it('imports the native runtime and shared machine permission policy', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, BffSessionModule) as unknown[]
        expect(imports).toEqual(expect.arrayContaining([AuthModule, BetterAuthRuntimeModule]))
    })

    it('exports the public onboarding reader, authenticator, and browser mutation guard', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, BffSessionModule)).toEqual([
            BffSessionCredentialAuthenticator,
            BrowserSessionMutationGuard,
            VERIFIED_HUMAN_SESSION_READER,
        ])
    })
})
