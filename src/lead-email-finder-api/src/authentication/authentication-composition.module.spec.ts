import { MODULE_METADATA } from '@nestjs/common/constants'
import { APP_GUARD } from '@nestjs/core'
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
import { AuthenticationCompositionModule } from './authentication-composition.module'
import { BrowserAuthGuard } from './browser-auth.guard'

describe('AuthenticationCompositionModule', () => {
    it('imports both business modules without depending on either module depending on the other', () => {
        const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthenticationCompositionModule) as unknown[]

        expect(imports).toEqual(expect.arrayContaining([AuthModule, BffSessionModule]))
    })

    it('assembles AuthenticationService from both authenticators via an explicit factory', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthenticationCompositionModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>
        const authenticationServiceProvider = providers.find(provider => provider.provide === AuthenticationService)

        expect(authenticationServiceProvider?.inject).toEqual([
            CredentialExtractor,
            ApiKeyCredentialAuthenticator,
            BffSessionCredentialAuthenticator,
        ])
    })

    it('registers AuthGuard before BrowserSessionMutationGuard as global APP_GUARD providers', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthenticationCompositionModule) as Array<{
            provide?: unknown
            useExisting?: unknown
        }>
        const appGuardProviders = providers.filter(provider => provider.provide === APP_GUARD)

        expect(appGuardProviders.map(provider => provider.useExisting)).toEqual([
            BrowserAuthGuard,
            BrowserSessionMutationGuard,
        ])
    })
})
