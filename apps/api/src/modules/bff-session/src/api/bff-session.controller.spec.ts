import { ForbiddenException, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthorizationCodeExchangeFailedError,
    BffSessionFlowService,
    LoginStateInvalidError,
} from '../application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../application/bff-session-configuration'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from '../application/current-account.service'
import { SingleActiveMembershipRequiredError } from '../application/human-membership-resolver.service'
import { IdTokenVerificationFailedError } from '../application/id-token-verifier'
import { BFF_CSRF_COOKIE_NAME, BFF_LOGIN_STATE_COOKIE_NAME } from './bff-cookie-names'
import { BffSessionController } from './bff-session.controller'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer',
    backchannelUrl: 'http://keycloak:8080/realms/lead-email-finder',
    jwksUri: 'http://keycloak:8080/realms/lead-email-finder/protocol/openid-connect/certs',
    clientId: 'lef-web-bff',
    clientSecret: 'secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise
    } catch (error) {
        return error
    }
    throw new Error('Expected promise to reject')
}

function headersOf(response: unknown): Record<string, string | string[] | undefined> {
    return (response as { headers: Record<string, string | string[] | undefined> }).headers
}

function responseText(response: unknown): string {
    const candidate = response as { body?: unknown; text?: string }
    return `${candidate.text ?? ''}\n${JSON.stringify(candidate.body)}`
}

function setCookieHeaders(response: unknown): string[] {
    const header = headersOf(response)['set-cookie']
    return header === undefined ? [] : Array.isArray(header) ? header : [header]
}

function expectCallbackPrivacyHeaders(response: unknown): void {
    expect(headersOf(response)['cache-control']).toBe('no-store')
    expect(headersOf(response)['referrer-policy']).toBe('no-referrer')
}

function expectLoginStateCookieCleared(response: unknown): void {
    const cookie = setCookieHeaders(response).find(value => value.startsWith(`${BFF_LOGIN_STATE_COOKIE_NAME}=`))
    expect(cookie).toEqual(expect.any(String))
    expect(cookie).toContain('Path=/v1/auth')
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Max-Age')
}

const humanPrincipal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer.example.test',
    subject: 'human-subject',
    organizationId: 'org-1',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'external-identity-1',
}

describe('BffSessionController current account', () => {
    let currentAccountService: jest.Mocked<Pick<CurrentAccountService, 'get'>>
    let controller: BffSessionController

    beforeEach(() => {
        currentAccountService = { get: jest.fn() }
        controller = new BffSessionController(
            {} as BffSessionFlowService,
            configuration,
            currentAccountService as unknown as CurrentAccountService,
        )
    })

    it('returns the exact nullable current-account shape from the application service', async () => {
        const account = {
            email: null,
            membership: { id: 'membership-1', role: 'owner' as const },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: [
                'verification.run' as const,
                'verification.read' as const,
                'team.manage' as const,
                'service_clients.manage' as const,
                'billing.read' as const,
                'billing.manage' as const,
            ],
            grantableServiceClientPermissions: [
                'verification:run' as const,
                'verification:read' as const,
                'members:manage' as const,
                'credentials:manage' as const,
                'billing:read' as const,
                'billing:manage' as const,
            ],
        }
        currentAccountService.get.mockResolvedValue(account)

        await expect(controller.getSession(humanPrincipal)).resolves.toEqual(account)
        expect(currentAccountService.get).toHaveBeenCalledWith(humanPrincipal)
    })

    it('maps a service-client principal to the exact human-session-required response', async () => {
        currentAccountService.get.mockRejectedValue(new HumanSessionRequiredError())

        const error = (await captureRejection(
            controller.getSession({ ...humanPrincipal, credentialKind: 'service_client' }),
        )) as ForbiddenException

        expect(error).toBeInstanceOf(ForbiddenException)
        expect(error.getStatus()).toBe(403)
        expect(error.getResponse()).toEqual({ code: 'human_session_required' })
    })

    it('maps unavailable account state to the exact authentication-required response', async () => {
        currentAccountService.get.mockRejectedValue(new CurrentAccountUnavailableError())

        const error = (await captureRejection(controller.getSession(humanPrincipal))) as UnauthorizedException

        expect(error).toBeInstanceOf(UnauthorizedException)
        expect(error.getStatus()).toBe(401)
        expect(error.getResponse()).toEqual({ code: 'authentication_required' })
    })

    it('preserves unexpected current-account failures', async () => {
        const unexpected = new Error('database unavailable')
        currentAccountService.get.mockRejectedValue(unexpected)

        await expect(controller.getSession(humanPrincipal)).rejects.toBe(unexpected)
    })
})

describe('BffSessionController callback HTTP boundary', () => {
    const bffSessionFlow: jest.Mocked<Pick<BffSessionFlowService, 'handleCallback' | 'login' | 'discardSession'>> = {
        handleCallback: jest.fn(),
        login: jest.fn(),
        discardSession: jest.fn(),
    }
    const currentAccountService: jest.Mocked<Pick<CurrentAccountService, 'get'>> = { get: jest.fn() }
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [BffSessionController],
            providers: [
                { provide: BffSessionFlowService, useValue: bffSessionFlow },
                { provide: BFF_SESSION_CONFIGURATION, useValue: configuration },
                { provide: CurrentAccountService, useValue: currentAccountService },
            ],
        }).compile()

        app = moduleRef.createNestApplication({ logger: false })
        app.useGlobalPipes(new ValidationPipe())
        await app.init()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await app.close()
    })

    const stateSecret = 'state-secret-5d96b69d'
    const codeSecret = 'code-secret-746d4fd3'

    it.each(['lef_session=stale-session', 'lef_session=%', 'lef_session=', 'lef_session=a; lef_session=b'])(
        'clears session and CSRF cookies before redirect for an unusable presented cookie: %s',
        async cookie => {
            bffSessionFlow.login.mockResolvedValue({
                state: 'safe-state',
                authorizationUrl: 'https://issuer/auth',
                clearSessionCookies: true,
            })
            const response = await request(app.getHttpServer())
                .get('/v1/auth/login?destination=%2Fapp%2Fverification')
                .set('cookie', cookie)
                .redirects(0)
                .expect(302)
            expect(bffSessionFlow.login).toHaveBeenCalledWith('/app/verification', expect.any(String))
            for (const name of ['lef_session', BFF_CSRF_COOKIE_NAME]) {
                const cleared = setCookieHeaders(response).find(value => value.startsWith(`${name}=`))!
                expect(cleared).toContain('Path=/')
                expect(cleared).toContain('SameSite=Lax')
                expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
                expect(cleared).not.toContain('Max-Age')
            }
            expect(headersOf(response).location).toBe('https://issuer/auth')
            expectCallbackPrivacyHeaders(response)
        },
    )

    it.each([
        ['missing', `/v1/auth/callback?code=${codeSecret}`],
        ['empty', `/v1/auth/callback?code=${codeSecret}&state=`],
        ['blank', `/v1/auth/callback?code=${codeSecret}&state=%20%20`],
        ['repeated', `/v1/auth/callback?code=${codeSecret}&state=${stateSecret}&state=${stateSecret}-repeated`],
        ['array-valued', `/v1/auth/callback?code=${codeSecret}&state[]=${stateSecret}`],
        ['object-valued', `/v1/auth/callback?code=${codeSecret}&state[value]=${stateSecret}`],
    ])('redirects a %s state through route policy instead of the global validation 400', async (_case, path) => {
        const response = await request(app.getHttpServer()).get(path).redirects(0).expect(302)

        expect(headersOf(response).location).toBe(`${configuration.appBaseUrl}/auth/error?code=login_state_invalid`)
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
        expect(bffSessionFlow.handleCallback).not.toHaveBeenCalled()
        expect(responseText(response)).not.toContain(codeSecret)
        expect(responseText(response)).not.toContain(stateSecret)
    })

    it.each([
        ['missing', `/v1/auth/callback?state=${stateSecret}`],
        ['empty', `/v1/auth/callback?state=${stateSecret}&code=`],
        ['blank', `/v1/auth/callback?state=${stateSecret}&code=%20%20`],
        ['repeated', `/v1/auth/callback?state=${stateSecret}&code=${codeSecret}&code=${codeSecret}-repeated`],
        ['array-valued', `/v1/auth/callback?state=${stateSecret}&code[]=${codeSecret}`],
        ['object-valued', `/v1/auth/callback?state=${stateSecret}&code[value]=${codeSecret}`],
    ])('passes a %s code as invalid after accepting state', async (_case, path) => {
        bffSessionFlow.handleCallback.mockRejectedValue(new AuthorizationCodeExchangeFailedError())

        const response = await request(app.getHttpServer())
            .get(path)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}`)
            .redirects(0)
            .expect(302)

        expect(bffSessionFlow.handleCallback).toHaveBeenCalledWith({
            code: undefined,
            state: stateSecret,
            cookieState: stateSecret,
            existingSessionId: undefined,
        })
        expect(headersOf(response).location).toBe(
            `${configuration.appBaseUrl}/auth/error?code=authorization_code_exchange_failed`,
        )
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
        expect(responseText(response)).not.toContain(codeSecret)
        expect(responseText(response)).not.toContain(stateSecret)
    })

    it('safely redirects a callback with a malformed login-state cookie encoding', async () => {
        bffSessionFlow.handleCallback.mockRejectedValue(new LoginStateInvalidError('missing cookie state'))

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}&code=${codeSecret}`)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=%`)
            .redirects(0)
            .expect(302)

        expect(bffSessionFlow.handleCallback).toHaveBeenCalledWith({
            code: codeSecret,
            state: stateSecret,
            cookieState: undefined,
            existingSessionId: undefined,
        })
        expect(headersOf(response).location).toBe(`${configuration.appBaseUrl}/auth/error?code=login_state_invalid`)
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
    })

    it('ignores an unrelated malformed cookie fragment when the login-state cookie is valid', async () => {
        bffSessionFlow.handleCallback.mockRejectedValue(new AuthorizationCodeExchangeFailedError())

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}`)
            .set('cookie', `junk=%; ${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}`)
            .redirects(0)
            .expect(302)

        expect(bffSessionFlow.handleCallback).toHaveBeenCalledWith({
            code: undefined,
            state: stateSecret,
            cookieState: stateSecret,
            existingSessionId: undefined,
        })
        expect(headersOf(response).location).toBe(
            `${configuration.appBaseUrl}/auth/error?code=authorization_code_exchange_failed`,
        )
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
    })

    it.each([
        [new LoginStateInvalidError('private state mismatch detail'), 'login_state_invalid'],
        [new AuthorizationCodeExchangeFailedError(), 'authorization_code_exchange_failed'],
        [new SingleActiveMembershipRequiredError(), 'active_membership_required'],
    ])('maps %s to the fixed same-origin %s redirect', async (callbackError, safeCode) => {
        bffSessionFlow.handleCallback.mockRejectedValue(callbackError)

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}&code=${codeSecret}`)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}`)
            .redirects(0)
            .expect(302)

        const location = new URL(headersOf(response).location as string)
        expect(location.origin).toBe(new URL(configuration.appBaseUrl).origin)
        expect(location.pathname).toBe('/auth/error')
        expect([...location.searchParams]).toEqual([['code', safeCode]])
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
        expect(responseText(response)).not.toContain(codeSecret)
        expect(responseText(response)).not.toContain(stateSecret)
        expect(responseText(response)).not.toContain(callbackError.message)
    })

    it('clears transient state, issues the session cookies, and preserves the success redirect', async () => {
        bffSessionFlow.handleCallback.mockResolvedValue({
            sessionId: 'new-session-id',
            csrfToken: 'new-csrf-token',
            destination: '/app/verification?view=recent',
        })

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}&code=${codeSecret}`)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}; lef_session=existing-session-id`)
            .redirects(0)
            .expect(302)

        expect(bffSessionFlow.handleCallback).toHaveBeenCalledWith({
            code: codeSecret,
            state: stateSecret,
            cookieState: stateSecret,
            existingSessionId: 'existing-session-id',
        })
        expect(headersOf(response).location).toBe(`${configuration.appBaseUrl}/app/verification?view=recent`)
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)

        const responseCookies = setCookieHeaders(response)
        const sessionCookie = responseCookies.find(cookie => cookie.startsWith('lef_session=new-session-id'))
        const csrfCookie = responseCookies.find(cookie => cookie.startsWith(`${BFF_CSRF_COOKIE_NAME}=new-csrf-token`))
        expect(sessionCookie).toEqual(expect.stringContaining('Path=/'))
        expect(sessionCookie).toEqual(expect.stringContaining('HttpOnly'))
        expect(sessionCookie).toEqual(expect.stringContaining('SameSite=Lax'))
        expect(csrfCookie).toEqual(expect.stringContaining('Path=/'))
        expect(csrfCookie).toEqual(expect.stringContaining('SameSite=Lax'))
        expect(csrfCookie).not.toEqual(expect.stringContaining('HttpOnly'))
        expect(headersOf(response).location).not.toContain(codeSecret)
        expect(headersOf(response).location).not.toContain(stateSecret)
    })

    it('maps a typed ID-token verification failure to a generic 502', async () => {
        const providerDetail = 'private provider signature detail'
        const verificationFailure = new IdTokenVerificationFailedError()
        verificationFailure.message = providerDetail
        bffSessionFlow.handleCallback.mockRejectedValue(verificationFailure)

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}&code=${codeSecret}`)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}`)
            .expect(502)

        expect(headersOf(response).location).toBeUndefined()
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
        expect(responseText(response)).not.toContain(providerDetail)
        expect(responseText(response)).not.toContain(codeSecret)
        expect(responseText(response)).not.toContain(stateSecret)
    })

    it('preserves an unexpected failure as a generic 500', async () => {
        const infrastructureDetail = 'private redis host and provider response'
        bffSessionFlow.handleCallback.mockRejectedValue(new Error(infrastructureDetail))

        const response = await request(app.getHttpServer())
            .get(`/v1/auth/callback?state=${stateSecret}&code=${codeSecret}`)
            .set('cookie', `${BFF_LOGIN_STATE_COOKIE_NAME}=${stateSecret}`)
            .expect(500)

        expect(headersOf(response).location).toBeUndefined()
        expectCallbackPrivacyHeaders(response)
        expectLoginStateCookieCleared(response)
        expect(responseText(response)).not.toContain(infrastructureDetail)
        expect(responseText(response)).not.toContain(codeSecret)
        expect(responseText(response)).not.toContain(stateSecret)
    })
})
