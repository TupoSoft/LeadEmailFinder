import { ExternalIdentityRecord, ExternalIdentityResolver, OrganizationMembershipRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionConfiguration } from './bff-session-configuration'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from './bff-session-flow.service'
import { HumanMembershipResolver } from './human-membership-resolver.service'
import { IdTokenVerifier } from './id-token-verifier'
import { OAuthProviderClient } from './oauth-provider-client'
import { PendingLoginStateStore } from './pending-login-state-store'
import { SessionStore } from './session-store'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer',
    backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
    jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
    clientId: 'lef-web-bff',
    clientSecret: 'secret',
    sessionIdleTimeoutMs: 8 * 60 * 60 * 1000,
    sessionAbsoluteTimeoutMs: 24 * 60 * 60 * 1000,
    isSecureCookie: false,
}

describe('BffSessionFlowService', () => {
    let oauthProviderClient: jest.Mocked<OAuthProviderClient>
    let idTokenVerifier: jest.Mocked<IdTokenVerifier>
    let pendingLoginStateStore: jest.Mocked<PendingLoginStateStore>
    let sessionStore: jest.Mocked<SessionStore>
    let externalIdentityResolver: jest.Mocked<Pick<ExternalIdentityResolver, 'resolveOrCreate'>>
    let humanMembershipResolver: jest.Mocked<Pick<HumanMembershipResolver, 'resolveActiveForLogin'>>
    let service: BffSessionFlowService

    beforeEach(() => {
        oauthProviderClient = {
            buildAuthorizationUrl: jest.fn().mockReturnValue('https://issuer/protocol/openid-connect/auth?...'),
            exchangeAuthorizationCode: jest.fn(),
            refreshTokens: jest.fn(),
            revokeSession: jest.fn(),
        }
        idTokenVerifier = { verify: jest.fn() }
        pendingLoginStateStore = { create: jest.fn(), consume: jest.fn() }
        sessionStore = { create: jest.fn(), get: jest.fn(), save: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) }
        externalIdentityResolver = { resolveOrCreate: jest.fn() }
        humanMembershipResolver = { resolveActiveForLogin: jest.fn() }

        service = new BffSessionFlowService(
            oauthProviderClient,
            idTokenVerifier,
            configuration,
            pendingLoginStateStore,
            sessionStore,
            externalIdentityResolver as unknown as ExternalIdentityResolver,
            humanMembershipResolver as unknown as HumanMembershipResolver,
        )
    })

    describe('login', () => {
        it('stores pending login state and returns the authorization URL and state', async () => {
            const result = await service.login()

            expect(pendingLoginStateStore.create).toHaveBeenCalledWith(
                result.state,
                expect.objectContaining({ redirectUri: 'http://localhost:53000/v1/auth/callback' }),
            )
            expect(oauthProviderClient.buildAuthorizationUrl).toHaveBeenCalledWith(
                expect.objectContaining({
                    redirectUri: 'http://localhost:53000/v1/auth/callback',
                    state: result.state,
                }),
            )
            expect(result.authorizationUrl).toBe('https://issuer/protocol/openid-connect/auth?...')
        })
    })

    describe('handleCallback', () => {
        function validCallbackInput(
            overrides: Partial<Parameters<typeof service.handleCallback>[0]> = {},
        ): Parameters<typeof service.handleCallback>[0] {
            return {
                code: 'auth-code',
                state: 'the-state',
                cookieState: 'the-state',
                existingSessionId: undefined,
                ...overrides,
            }
        }

        it('rejects when the login-state cookie is missing', async () => {
            await expect(
                service.handleCallback(validCallbackInput({ cookieState: undefined })),
            ).rejects.toThrow(LoginStateInvalidError)
            expect(pendingLoginStateStore.consume).not.toHaveBeenCalled()
        })

        it('rejects when the login-state cookie does not match the state query parameter', async () => {
            await expect(
                service.handleCallback(validCallbackInput({ cookieState: 'a-different-state' })),
            ).rejects.toThrow(LoginStateInvalidError)
        })

        it('rejects a replayed or unknown state (pending state already consumed)', async () => {
            pendingLoginStateStore.consume.mockResolvedValue(undefined)

            await expect(service.handleCallback(validCallbackInput())).rejects.toThrow(LoginStateInvalidError)
        })

        it('rejects when the authorization code exchange fails (e.g. wrong PKCE verifier)', async () => {
            pendingLoginStateStore.consume.mockResolvedValue({
                nonce: 'nonce-1',
                codeVerifier: 'verifier-1',
                redirectUri: 'http://localhost:53000/v1/auth/callback',
                createdAt: Date.now(),
            })
            oauthProviderClient.exchangeAuthorizationCode.mockRejectedValue(new Error('invalid_grant'))

            await expect(service.handleCallback(validCallbackInput())).rejects.toThrow(AuthorizationCodeExchangeFailedError)
        })

        it('creates a session and deletes the prior one when rotating', async () => {
            pendingLoginStateStore.consume.mockResolvedValue({
                nonce: 'nonce-1',
                codeVerifier: 'verifier-1',
                redirectUri: 'http://localhost:53000/v1/auth/callback',
                createdAt: Date.now(),
            })
            oauthProviderClient.exchangeAuthorizationCode.mockResolvedValue({
                idToken: 'id-token',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                accessTokenExpiresInSeconds: 300,
                refreshTokenExpiresInSeconds: 1800,
            })
            idTokenVerifier.verify.mockResolvedValue({ issuer: 'https://issuer', subject: 'human-1', email: null })
            externalIdentityResolver.resolveOrCreate.mockResolvedValue({ id: 'identity-1' } as ExternalIdentityRecord)
            humanMembershipResolver.resolveActiveForLogin.mockResolvedValue({
                organizationId: 'org-1',
            } as OrganizationMembershipRecord)
            sessionStore.create.mockResolvedValue('new-session-id')

            const result = await service.handleCallback(validCallbackInput({ existingSessionId: 'old-session-id' }))

            expect(sessionStore.delete).toHaveBeenCalledWith('old-session-id')
            expect(sessionStore.create).toHaveBeenCalledWith(
                expect.objectContaining({ organizationId: 'org-1', externalIdentityId: 'identity-1' }),
            )
            expect(result.sessionId).toBe('new-session-id')
            expect(typeof result.csrfToken).toBe('string')
        })

        it('does not attempt to delete a prior session when none exists', async () => {
            pendingLoginStateStore.consume.mockResolvedValue({
                nonce: 'nonce-1',
                codeVerifier: 'verifier-1',
                redirectUri: 'http://localhost:53000/v1/auth/callback',
                createdAt: Date.now(),
            })
            oauthProviderClient.exchangeAuthorizationCode.mockResolvedValue({
                idToken: 'id-token',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                accessTokenExpiresInSeconds: 300,
                refreshTokenExpiresInSeconds: 1800,
            })
            idTokenVerifier.verify.mockResolvedValue({ issuer: 'https://issuer', subject: 'human-1', email: null })
            externalIdentityResolver.resolveOrCreate.mockResolvedValue({ id: 'identity-1' } as ExternalIdentityRecord)
            humanMembershipResolver.resolveActiveForLogin.mockResolvedValue({
                organizationId: 'org-1',
            } as OrganizationMembershipRecord)
            sessionStore.create.mockResolvedValue('new-session-id')

            await service.handleCallback(validCallbackInput())

            expect(sessionStore.delete).not.toHaveBeenCalled()
        })
    })

    describe('logout', () => {
        it('is a no-op when there is no session id', async () => {
            await service.logout(undefined)

            expect(sessionStore.get).not.toHaveBeenCalled()
        })

        it('is a no-op when the session id does not resolve to a record', async () => {
            sessionStore.get.mockResolvedValue(undefined)

            await service.logout('session-1')

            expect(oauthProviderClient.revokeSession).not.toHaveBeenCalled()
            expect(sessionStore.delete).not.toHaveBeenCalled()
        })

        it('revokes the Keycloak session and deletes the local record', async () => {
            sessionStore.get.mockResolvedValue({
                externalIdentityId: 'identity-1',
                organizationId: 'org-1',
                issuer: 'https://issuer',
                subject: 'human-1',
                csrfToken: 'csrf',
                accessToken: 'access',
                refreshToken: 'refresh-token',
                accessTokenExpiresAt: Date.now() + 1000,
                refreshTokenExpiresAt: Date.now() + 2000,
                absoluteExpiresAt: Date.now() + 3000,
                createdAt: Date.now(),
            })

            await service.logout('session-1')

            expect(oauthProviderClient.revokeSession).toHaveBeenCalledWith('refresh-token')
            expect(sessionStore.delete).toHaveBeenCalledWith('session-1')
        })
    })
})
