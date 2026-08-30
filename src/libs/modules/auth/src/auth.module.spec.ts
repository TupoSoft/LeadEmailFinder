import { MODULE_METADATA } from '@nestjs/common/constants'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthModule } from './auth.module'
import { CredentialExtractor } from './application/credential-extractor'
import { OidcCredentialAuthenticator } from './application/oidc-credential-authenticator'
import { ServiceCredentialResolver } from './application/service-credential-resolver.service'

describe('AuthModule', () => {
    it('provides the OIDC authenticator chain via explicit factories', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: CredentialExtractor }),
                expect.objectContaining({ provide: ServiceCredentialResolver, inject: [ACTIVE_SERVICE_CREDENTIAL_READER] }),
                expect.objectContaining({ provide: OidcCredentialAuthenticator }),
            ]),
        )
    })

    it('does not itself register AuthenticationService or a global APP_GUARD (host composition owns those)', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[]
        const providedTokens = providers.map(provider =>
            typeof provider === 'function' ? provider : (provider as { provide?: unknown }).provide,
        )

        expect(providedTokens.some(token => token?.toString() === 'Symbol(APP_GUARD)')).toBe(false)
        expect(providedTokens.some(token => typeof token === 'function' && token.name === 'AuthenticationService')).toBe(
            false,
        )
    })

    it('exports the OIDC authenticator and its infrastructure dependencies', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) as unknown[]

        expect(exports).toEqual(expect.arrayContaining([CredentialExtractor, OidcCredentialAuthenticator]))
    })
})
