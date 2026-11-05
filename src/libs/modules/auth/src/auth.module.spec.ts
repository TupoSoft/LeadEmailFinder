import { MODULE_METADATA } from '@nestjs/common/constants'
import { ACTIVE_SERVICE_CREDENTIAL_READER } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthModule } from './auth.module'
import { CredentialExtractor } from './application/credential-extractor'
import { ApiKeyCredentialAuthenticator } from './application/api-key-credential-authenticator'
import { RolePermissionPolicy } from './application/role-permission-policy.service'
import { SERVICE_CLIENT_GRANT_POLICY } from './application/service-client-grant-policy'

describe('AuthModule', () => {
    it('provides the API-key authenticator chain via explicit factories', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{
            provide?: unknown
            inject?: unknown[]
        }>

        expect(providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ provide: CredentialExtractor }),
                expect.objectContaining({
                    provide: SERVICE_CLIENT_GRANT_POLICY,
                    inject: [RolePermissionPolicy],
                    useFactory: expect.any(Function),
                }),
                expect.objectContaining({
                    provide: ApiKeyCredentialAuthenticator,
                    inject: [ACTIVE_SERVICE_CREDENTIAL_READER],
                }),
            ]),
        )
    })

    it('does not itself register AuthenticationService or a global APP_GUARD (host composition owns those)', () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[]
        const providedTokens = providers.map(provider =>
            typeof provider === 'function' ? provider : (provider as { provide?: unknown }).provide,
        )

        expect(providedTokens.some(token => token?.toString() === 'Symbol(APP_GUARD)')).toBe(false)
        expect(
            providedTokens.some(token => typeof token === 'function' && token.name === 'AuthenticationService'),
        ).toBe(false)
    })

    it('exports the API-key authenticator ingredients and service-client grant policy', () => {
        const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule) as unknown[]

        expect(exports).toEqual(
            expect.arrayContaining([CredentialExtractor, ApiKeyCredentialAuthenticator, SERVICE_CLIENT_GRANT_POLICY]),
        )
    })
})
