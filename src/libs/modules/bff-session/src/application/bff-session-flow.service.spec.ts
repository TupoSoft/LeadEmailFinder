import {
    ExternalIdentityRecord,
    ExternalIdentityResolver,
    OrganizationMembershipRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionConfiguration } from './bff-session-configuration'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from './bff-session-flow.service'
import { HumanMembershipResolver, SingleActiveMembershipRequiredError } from './human-membership-resolver.service'
import { IdTokenVerificationFailedError, IdTokenVerifier } from './id-token-verifier'
import { AuthorizationCodeGrantRejectedError, OAuthProviderClient } from './oauth-provider-client'
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
    let externalIdentityResolver: jest.Mocked<Pick<ExternalIdentityResolver, 'findExisting' | 'synchronizeEmail'>>
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
        sessionStore = {
            create: jest.fn(),
            replace: jest.fn(),
            get: jest.fn(),
            save: jest.fn(),
            delete: jest.fn().mockResolvedValue(undefined),
        }
        externalIdentityResolver = { findExisting: jest.fn(), synchronizeEmail: jest.fn() }
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
            expect(result.clearSessionCookies).toBe(false)
        })
    })

    it.each(['stale-session', 'forged-session', ''])(
        'clears unusable presented cookies and records a fresh lineage (%p)',
        async sessionId => {
            sessionStore.get.mockResolvedValue(undefined)
            const result = await service.login('/app/verification', sessionId)
            expect(result.clearSessionCookies).toBe(true)
            expect(pendingLoginStateStore.create).toHaveBeenCalledWith(
                result.state,
                expect.objectContaining({ destination: '/app/verification', sessionLineage: { kind: 'fresh' } }),
            )
        },
    )

    it('records the exact valid session expected at callback time', async () => {
        sessionStore.get.mockResolvedValue({ absoluteExpiresAt: Date.now() + 10_000 } as never)
        const result = await service.login('//evil.test', 'existing-session')
        expect(result.clearSessionCookies).toBe(false)
        expect(pendingLoginStateStore.create).toHaveBeenCalledWith(
            result.state,
            expect.objectContaining({
                destination: '/app',
                sessionLineage: { kind: 'replace', sessionId: 'existing-session' },
            }),
        )
    })

    describe('handleCallback', () => {
        const pendingState = {
            destination: '/app/verification?view=recent',
            sessionLineage: { kind: 'fresh' as const },
            nonce: 'nonce-1',
            codeVerifier: 'verifier-1',
            redirectUri: 'http://localhost:53000/v1/auth/callback',
            createdAt: Date.now(),
        }

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

        function arrangeSuccessfulCallback(): void {
            pendingLoginStateStore.consume.mockResolvedValue(pendingState)
            oauthProviderClient.exchangeAuthorizationCode.mockResolvedValue({
                idToken: 'id-token',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                accessTokenExpiresInSeconds: 300,
                refreshTokenExpiresInSeconds: 1800,
            })
            idTokenVerifier.verify.mockResolvedValue({ issuer: 'https://issuer', subject: 'human-1', email: null })
            const externalIdentity: ExternalIdentityRecord = {
                id: 'identity-1',
                issuer: 'https://issuer',
                subject: 'human-1',
                email: null,
            }
            externalIdentityResolver.findExisting.mockResolvedValue(externalIdentity)
            externalIdentityResolver.synchronizeEmail.mockResolvedValue(externalIdentity)
            humanMembershipResolver.resolveActiveForLogin.mockResolvedValue({
                organizationId: 'org-1',
            } as OrganizationMembershipRecord)
            sessionStore.create.mockResolvedValue('new-session-id')
        }

        it('rejects when the login-state cookie is missing', async () => {
            await expect(service.handleCallback(validCallbackInput({ cookieState: undefined }))).rejects.toThrow(
                LoginStateInvalidError,
            )
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

        it.each([undefined, '', '   '])(
            'consumes valid state before rejecting a missing or blank authorization code (%p)',
            async code => {
                pendingLoginStateStore.consume.mockResolvedValue(pendingState)

                await expect(service.handleCallback(validCallbackInput({ code }))).rejects.toThrow(
                    AuthorizationCodeExchangeFailedError,
                )
                expect(pendingLoginStateStore.consume).toHaveBeenCalledWith('the-state')
                expect(oauthProviderClient.exchangeAuthorizationCode).not.toHaveBeenCalled()
            },
        )

        it('maps an explicit authorization-code grant rejection to the recoverable callback error', async () => {
            pendingLoginStateStore.consume.mockResolvedValue(pendingState)
            oauthProviderClient.exchangeAuthorizationCode.mockRejectedValue(new AuthorizationCodeGrantRejectedError())

            await expect(service.handleCallback(validCallbackInput())).rejects.toThrow(
                AuthorizationCodeExchangeFailedError,
            )
        })

        it('preserves provider infrastructure failures for the redacted server-error boundary', async () => {
            const providerFailure = new Error('provider transport failed')
            pendingLoginStateStore.consume.mockResolvedValue(pendingState)
            oauthProviderClient.exchangeAuthorizationCode.mockRejectedValue(providerFailure)

            await expect(service.handleCallback(validCallbackInput())).rejects.toBe(providerFailure)
            expect(idTokenVerifier.verify).not.toHaveBeenCalled()
            expect(sessionStore.create).not.toHaveBeenCalled()
        })

        it.each([
            { caseName: 'typed integrity rejection', verifierFailure: new IdTokenVerificationFailedError() },
            { caseName: 'unexpected verifier fault', verifierFailure: new Error('unexpected verifier fault') },
        ])('preserves ID-token verifier failures for the HTTP error mapper: $caseName', async ({ verifierFailure }) => {
            arrangeSuccessfulCallback()
            idTokenVerifier.verify.mockRejectedValue(verifierFailure)

            await expect(service.handleCallback(validCallbackInput())).rejects.toBe(verifierFailure)
            expect(externalIdentityResolver.findExisting).not.toHaveBeenCalled()
            expect(sessionStore.create).not.toHaveBeenCalled()
        })

        it('does not create or update an identity when the verified subject is unknown', async () => {
            arrangeSuccessfulCallback()
            externalIdentityResolver.findExisting.mockResolvedValue(undefined)

            await expect(service.handleCallback(validCallbackInput())).rejects.toThrow(
                SingleActiveMembershipRequiredError,
            )
            expect(externalIdentityResolver.synchronizeEmail).not.toHaveBeenCalled()
            expect(humanMembershipResolver.resolveActiveForLogin).not.toHaveBeenCalled()
            expect(sessionStore.create).not.toHaveBeenCalled()
        })

        it('does not update identity data or create a session when active membership resolution fails', async () => {
            arrangeSuccessfulCallback()
            humanMembershipResolver.resolveActiveForLogin.mockRejectedValue(new SingleActiveMembershipRequiredError())

            await expect(service.handleCallback(validCallbackInput())).rejects.toThrow(
                SingleActiveMembershipRequiredError,
            )
            expect(externalIdentityResolver.synchronizeEmail).not.toHaveBeenCalled()
            expect(sessionStore.create).not.toHaveBeenCalled()
        })

        it('atomically replaces the prior session and returns the stored destination', async () => {
            arrangeSuccessfulCallback()

            pendingLoginStateStore.consume.mockResolvedValue({
                ...pendingState,
                sessionLineage: { kind: 'replace', sessionId: 'old-session-id' },
            })
            sessionStore.replace.mockResolvedValue(true)

            const result = await service.handleCallback(validCallbackInput({ existingSessionId: 'old-session-id' }))

            expect(sessionStore.delete).not.toHaveBeenCalled()
            expect(sessionStore.create).not.toHaveBeenCalled()
            expect(sessionStore.replace).toHaveBeenCalledWith(
                'old-session-id',
                result.sessionId,
                expect.objectContaining({ organizationId: 'org-1', externalIdentityId: 'identity-1' }),
            )
            expect(result.destination).toBe('/app/verification?view=recent')
            expect(typeof result.csrfToken).toBe('string')
        })

        it.each([undefined, 'wrong-session', ''])(
            'rejects a replacement lineage with a changed cookie (%p)',
            async existingSessionId => {
                arrangeSuccessfulCallback()
                pendingLoginStateStore.consume.mockResolvedValue({
                    ...pendingState,
                    sessionLineage: { kind: 'replace', sessionId: 'old-session-id' },
                })
                await expect(service.handleCallback(validCallbackInput({ existingSessionId }))).rejects.toThrow(
                    LoginStateInvalidError,
                )
                expect(oauthProviderClient.exchangeAuthorizationCode).not.toHaveBeenCalled()
                expect(sessionStore.replace).not.toHaveBeenCalled()
            },
        )

        it.each(['appeared-session', ''])(
            'rejects a fresh lineage when any cookie appeared (%p)',
            async existingSessionId => {
                arrangeSuccessfulCallback()
                await expect(service.handleCallback(validCallbackInput({ existingSessionId }))).rejects.toThrow(
                    LoginStateInvalidError,
                )
                expect(oauthProviderClient.exchangeAuthorizationCode).not.toHaveBeenCalled()
                expect(sessionStore.create).not.toHaveBeenCalled()
            },
        )

        it('maps a replacement conflict to invalid state without falling back to create', async () => {
            arrangeSuccessfulCallback()
            pendingLoginStateStore.consume.mockResolvedValue({
                ...pendingState,
                sessionLineage: { kind: 'replace', sessionId: 'old-session-id' },
            })
            sessionStore.replace.mockResolvedValue(false)
            await expect(
                service.handleCallback(validCallbackInput({ existingSessionId: 'old-session-id' })),
            ).rejects.toThrow(LoginStateInvalidError)
            expect(sessionStore.create).not.toHaveBeenCalled()
            expect(sessionStore.delete).not.toHaveBeenCalled()
        })

        it('preserves an atomic store failure without falling back to create or deleting the old session', async () => {
            arrangeSuccessfulCallback()
            pendingLoginStateStore.consume.mockResolvedValue({
                ...pendingState,
                sessionLineage: { kind: 'replace', sessionId: 'old-session-id' },
            })
            const failure = new Error('injected store failure')
            sessionStore.replace.mockRejectedValue(failure)
            await expect(
                service.handleCallback(validCallbackInput({ existingSessionId: 'old-session-id' })),
            ).rejects.toBe(failure)
            expect(sessionStore.create).not.toHaveBeenCalled()
            expect(sessionStore.delete).not.toHaveBeenCalled()
        })

        it('does not attempt to delete a prior session when none exists', async () => {
            arrangeSuccessfulCallback()

            await service.handleCallback(validCallbackInput())

            expect(sessionStore.delete).not.toHaveBeenCalled()
        })

        it('allows only one of two concurrent callbacks to exchange tokens and create a session', async () => {
            arrangeSuccessfulCallback()

            let arrivals = 0
            let storedState: typeof pendingState | undefined = pendingState
            let releaseConsumers!: () => void
            const consumersReleased = new Promise<void>(resolve => {
                releaseConsumers = resolve
            })
            let announceBothConsumers!: () => void
            const bothConsumersArrived = new Promise<void>(resolve => {
                announceBothConsumers = resolve
            })
            pendingLoginStateStore.consume.mockImplementation(async () => {
                arrivals += 1
                if (arrivals === 2) {
                    announceBothConsumers()
                }
                await consumersReleased
                const consumed = storedState
                storedState = undefined
                return consumed
            })

            const first = service.handleCallback(validCallbackInput())
            const second = service.handleCallback(validCallbackInput())
            await bothConsumersArrived
            releaseConsumers()

            const results = await Promise.allSettled([first, second])

            expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
            const [rejection] = results.filter(result => result.status === 'rejected')
            expect(rejection).toMatchObject({ reason: expect.any(LoginStateInvalidError) })
            expect(pendingLoginStateStore.consume).toHaveBeenCalledTimes(2)
            expect(oauthProviderClient.exchangeAuthorizationCode).toHaveBeenCalledTimes(1)
            expect(idTokenVerifier.verify).toHaveBeenCalledTimes(1)
            expect(externalIdentityResolver.findExisting).toHaveBeenCalledTimes(1)
            expect(externalIdentityResolver.synchronizeEmail).toHaveBeenCalledTimes(1)
            expect(humanMembershipResolver.resolveActiveForLogin).toHaveBeenCalledTimes(1)
            expect(sessionStore.create).toHaveBeenCalledTimes(1)
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
