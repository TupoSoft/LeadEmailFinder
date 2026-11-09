import { INestApplication, LoggerService } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Request, Response } from 'express'
import request from 'supertest'
import { ExternalIdentityResolver } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService, AuthGuard, CredentialExtractor } from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionController } from './api/bff-session.controller'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './application/bff-session-configuration'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { CurrentAccountService } from './application/current-account.service'
import { HumanMembershipResolver } from './application/human-membership-resolver.service'
import { OAuthProviderClient } from './application/oauth-provider-client'
import { SessionTokenRefresher } from './application/session-token-refresher.service'
import { PendingLoginState } from './domain/pending-login-state'
import { InMemorySessionStore } from './infrastructure/memory/in-memory-session-store'

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer.example.test',
    backchannelUrl: 'https://issuer.example.test',
    jwksUri: 'https://issuer.example.test/certs',
    clientId: 'bff-client',
    clientSecret: 'unused-fixture-secret',
    sessionIdleTimeoutMs: 60_000,
    sessionAbsoluteTimeoutMs: 120_000,
    isSecureCookie: false,
}

function cookies(response: request.Response): string[] {
    return (response.headers['set-cookie'] as unknown as string[]) ?? []
}
function sessionCookie(response: request.Response): string {
    return cookies(response)
        .find(value => value.startsWith('lef_session='))!
        .split(';')[0]
}

describe('BFF session lineage and atomic replacement HTTP boundary', () => {
    let app: INestApplication
    let store: InMemorySessionStore
    let flow: BffSessionFlowService
    let controller: BffSessionController
    const pending = new Map<string, PendingLoginState>()
    const logger: jest.Mocked<LoggerService> = { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    const oauth: jest.Mocked<OAuthProviderClient> = {
        buildAuthorizationUrl: jest.fn(({ state }) => `https://issuer.example.test/authorize?state=${state}`),
        exchangeAuthorizationCode: jest.fn(),
        refreshTokens: jest.fn(),
        revokeSession: jest.fn(),
    }

    beforeAll(async () => {
        store = new InMemorySessionStore(configuration.sessionIdleTimeoutMs)
        const membershipResolver = {
            resolveActiveForLogin: jest.fn().mockResolvedValue({ organizationId: 'organization-1', role: 'member' }),
            resolveActive: jest.fn().mockResolvedValue({ organizationId: 'organization-1', role: 'member' }),
        } as unknown as HumanMembershipResolver
        const identity = { id: 'identity-1', issuer: configuration.issuer, subject: 'subject-1', email: null }
        flow = new BffSessionFlowService(
            oauth,
            { verify: jest.fn().mockResolvedValue(identity) },
            configuration,
            {
                create: (state, value) => {
                    pending.set(state, value)
                    return Promise.resolve()
                },
                consume: state => {
                    const value = pending.get(state)
                    pending.delete(state)
                    return Promise.resolve(value)
                },
            },
            store,
            {
                findExisting: jest.fn().mockResolvedValue(identity),
                synchronizeEmail: jest.fn().mockResolvedValue(identity),
            } as unknown as ExternalIdentityResolver,
            membershipResolver,
        )
        const authenticator = new BffSessionCredentialAuthenticator(
            store,
            new SessionTokenRefresher(oauth),
            membershipResolver,
        )
        const module = await Test.createTestingModule({
            controllers: [BffSessionController],
            providers: [
                { provide: BffSessionFlowService, useValue: flow },
                { provide: BFF_SESSION_CONFIGURATION, useValue: configuration },
                {
                    provide: CurrentAccountService,
                    useValue: {
                        get: jest.fn().mockResolvedValue({
                            email: null,
                            membership: { id: 'membership-1', role: 'member' },
                            organization: { id: 'organization-1', name: 'Example Organization' },
                            capabilities: ['verification.run'],
                            grantableServiceClientPermissions: [],
                        }),
                    },
                },
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [authenticator]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
            ],
        }).compile()
        app = module.createNestApplication({ logger })
        await app.init()
        controller = module.get(BffSessionController)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        oauth.exchangeAuthorizationCode.mockResolvedValue({
            idToken: 'id-fixture',
            accessToken: 'access-fixture',
            refreshToken: 'refresh-fixture',
            accessTokenExpiresInSeconds: 300,
            refreshTokenExpiresInSeconds: 600,
        })
    })
    afterEach(() => {
        pending.clear()
        jest.restoreAllMocks()
    })
    afterAll(async () => {
        await app.close()
    })

    async function start(
        cookie?: string,
        destination = '/app/verification?view=recent',
    ): Promise<{ path: string; cookie: string }> {
        const req = request(app.getHttpServer()).get('/v1/auth/login').query({ destination })
        if (cookie !== undefined) req.set('cookie', cookie)
        const response = await req.expect(302)
        const state = new URL(response.headers.location).searchParams.get('state')!
        const loginCookie = cookies(response)
            .find(value => value.startsWith('lef_login_state='))!
            .split(';')[0]
        return {
            path: `/v1/auth/callback?state=${state}&code=authorization-fixture`,
            cookie: [loginCookie, cookie].filter(Boolean).join('; '),
        }
    }
    async function finish(attempt: { path: string; cookie: string }): Promise<request.Response> {
        return request(app.getHttpServer()).get(attempt.path).set('cookie', attempt.cookie).redirects(0).expect(302)
    }

    it('creates a fresh session and preserves the pending destination while ignoring callback destination input', async () => {
        const attempt = await start()
        const response = await finish({ ...attempt, path: `${attempt.path}&destination=https://evil.test` })
        expect(response.headers.location).toBe(`${configuration.appBaseUrl}/app/verification?view=recent`)
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie(response)).expect(200)
    })

    it.each(['https://evil.test/app', '//evil.test/app', '/auth/error', '/app/%2e%2e/auth/error'])(
        'redirects an unsafe destination to application home (%s)',
        async destination => {
            const response = await finish(await start(undefined, destination))
            expect(response.headers.location).toBe(`${configuration.appBaseUrl}/app`)
        },
    )

    it('clears a session that expired after issuance and completes a fresh login', async () => {
        const oldCookie = sessionCookie(await finish(await start()))
        const id = oldCookie.slice('lef_session='.length)
        const oldRecord = (await store.get(id))!
        await store.save(id, { ...oldRecord, absoluteExpiresAt: Date.now() + 30 })
        await new Promise(resolve => setTimeout(resolve, 50))
        const response = await request(app.getHttpServer())
            .get('/v1/auth/login')
            .set('cookie', `${oldCookie}; lef_csrf_token=old-csrf`)
            .expect(302)
        for (const name of ['lef_session', 'lef_csrf_token'])
            expect(cookies(response).find(cookie => cookie.startsWith(`${name}=`))).toContain(
                'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            )
        const state = new URL(response.headers.location).searchParams.get('state')!
        const loginCookie = cookies(response)
            .find(value => value.startsWith('lef_login_state='))!
            .split(';')[0]
        const callback = await finish({
            path: `/v1/auth/callback?state=${state}&code=authorization-fixture`,
            cookie: loginCookie,
        })
        expect(callback.headers.location).toBe(`${configuration.appBaseUrl}/app`)
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie(callback)).expect(200)
    })

    it('invalidates a captured old cookie in another browser context before installing the new cookie there', async () => {
        const first = await finish(await start())
        const oldCookie = sessionCookie(first)
        const otherContext = request.agent(app.getHttpServer())
        await otherContext.get('/v1/auth/session').set('cookie', oldCookie).expect(200)
        const replacement = await finish(await start(oldCookie))
        expect(replacement.headers.location).toBe(`${configuration.appBaseUrl}/app/verification?view=recent`)
        await otherContext.get('/v1/auth/session').set('cookie', oldCookie).expect(401)
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', sessionCookie(replacement)).expect(200)
    })

    it('races two distinct valid login states from one session and creates exactly one replacement', async () => {
        const oldCookie = sessionCookie(await finish(await start()))
        const attempts = await Promise.all([start(oldCookie), start(oldCookie)])
        const replace = jest.spyOn(store, 'replace')
        const responses = await Promise.all(attempts.map(finish))
        expect(responses.map(response => response.headers.location).sort()).toEqual(
            [
                `${configuration.appBaseUrl}/app/verification?view=recent`,
                `${configuration.appBaseUrl}/auth/error?code=login_state_invalid`,
            ].sort(),
        )
        expect(replace).toHaveBeenCalledTimes(2)
        const candidateRecords = await Promise.all(replace.mock.calls.map(([, id]) => store.get(id)))
        expect(candidateRecords.filter(Boolean)).toHaveLength(1)
        const loser = responses.find(response => response.headers.location.includes('/auth/error'))!
        expect(cookies(loser).some(cookie => cookie.startsWith('lef_session='))).toBe(false)
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', oldCookie).expect(401)
    })

    it('rejects an expected session removed between login and callback without an orphan', async () => {
        const oldCookie = sessionCookie(await finish(await start()))
        const attempt = await start(oldCookie)
        await store.delete(oldCookie.slice('lef_session='.length))
        const replace = jest.spyOn(store, 'replace')
        const response = await finish(attempt)
        expect(response.headers.location).toBe(`${configuration.appBaseUrl}/auth/error?code=login_state_invalid`)
        expect(await store.get(replace.mock.calls[0][1])).toBeUndefined()
        expect(cookies(response).some(cookie => cookie.startsWith('lef_session='))).toBe(false)
    })

    it('preserves the old session and sets no new cookie after an injected atomic store failure', async () => {
        const oldCookie = sessionCookie(await finish(await start()))
        const attempt = await start(oldCookie)
        const replace = jest.spyOn(store, 'replace').mockRejectedValueOnce(new Error('injected session-store failure'))
        const response = await request(app.getHttpServer()).get(attempt.path).set('cookie', attempt.cookie).expect(500)
        expect(cookies(response).some(cookie => cookie.startsWith('lef_session='))).toBe(false)
        expect(await store.get(replace.mock.calls[0][1])).toBeUndefined()
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', oldCookie).expect(200)
        const logs = JSON.stringify(logger.error.mock.calls)
        expect(logs).not.toContain(oldCookie.slice('lef_session='.length))
        expect(logs).not.toContain('authorization-fixture')
        expect(logs).not.toContain('access-fixture')
        expect(logs).not.toContain('refresh-fixture')
    })

    it('consumes a valid login state once and rejects callback replay', async () => {
        const attempt = await start()
        await finish(attempt)
        const replay = await finish(attempt)
        expect(replay.headers.location).toBe(`${configuration.appBaseUrl}/auth/error?code=login_state_invalid`)
        expect(cookies(replay).some(cookie => cookie.startsWith('lef_session='))).toBe(false)
    })

    it.each(['stale-cookie', 'forged-cookie', '%', ''])(
        'clears unusable session cookies on login and completes a fresh callback (%p)',
        async value => {
            const response = await request(app.getHttpServer())
                .get('/v1/auth/login')
                .set('cookie', `lef_session=${value}; lef_csrf_token=old-csrf`)
                .expect(302)
            for (const name of ['lef_session', 'lef_csrf_token'])
                expect(cookies(response).find(cookie => cookie.startsWith(`${name}=`))).toContain(
                    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
                )
            const state = new URL(response.headers.location).searchParams.get('state')!
            const loginCookie = cookies(response)
                .find(value => value.startsWith('lef_login_state='))!
                .split(';')[0]
            const callback = await finish({
                path: `/v1/auth/callback?state=${state}&code=authorization-fixture`,
                cookie: loginCookie,
            })
            expect(callback.headers.location).toBe(`${configuration.appBaseUrl}/app`)
            await request(app.getHttpServer())
                .get('/v1/auth/session')
                .set('cookie', sessionCookie(callback))
                .expect(200)
        },
    )

    it.each(['cookie', 'redirect'] as const)(
        'removes the new record and cookie headers if controller %s fails before response commit',
        async method => {
            const login = await flow.login()
            const create = jest.spyOn(store, 'create')
            const res = {
                set: jest.fn(),
                clearCookie: jest.fn(),
                cookie: jest.fn(),
                redirect: jest.fn(),
                removeHeader: jest.fn(),
            }
            res[method].mockImplementationOnce(() => {
                throw new Error('injected controller failure')
            })
            await expect(
                controller.callback(
                    { state: login.state, code: 'authorization-fixture' },
                    { headers: { cookie: `lef_login_state=${login.state}` } } as Request,
                    res as unknown as Response,
                ),
            ).rejects.toThrow('injected controller failure')
            const id = (await create.mock.results[0].value) as string
            expect(await store.get(id)).toBeUndefined()
            expect(res.removeHeader).toHaveBeenCalledWith('Set-Cookie')
        },
    )
})
