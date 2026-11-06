import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { Request, Response, NextFunction } from 'express'
import { nativeSessionCookieEffects } from '@tuposoft/lead-email-finder/better-auth'
import { BFF_SESSION_CONFIGURATION } from '../application/bff-session-configuration'
import {
    CurrentAccountService,
    CurrentAccountUnavailableError,
    HumanSessionRequiredError,
} from '../application/current-account.service'
import { NativeSignInStateService } from '../application/native-sign-in-state.service'
import { VERIFIED_HUMAN_SESSION_READER } from '../application/verified-human-session-reader'
import { BffSessionController } from './bff-session.controller'
import { BrowserSessionMutationGuard } from './browser-session-mutation.guard'
import { CsrfGuard } from './csrf.guard'
import { OriginGuard } from './origin.guard'

const origin = 'http://localhost:53000'
const configuration = {
    appBaseUrl: origin,
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}
const nativeCookie = 'lef_session=native-credential; lef_csrf_token=csrf'

describe('narrow native browser authentication HTTP boundary', () => {
    let app: INestApplication
    const state = { read: jest.fn() }
    const sessions = { read: jest.fn() }
    const account = { get: jest.fn() }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [BffSessionController],
            providers: [
                { provide: BFF_SESSION_CONFIGURATION, useValue: configuration },
                { provide: CurrentAccountService, useValue: account },
                { provide: NativeSignInStateService, useValue: state },
                { provide: VERIFIED_HUMAN_SESSION_READER, useValue: sessions },
                OriginGuard,
                CsrfGuard,
                BrowserSessionMutationGuard,
            ],
        }).compile()
        app = module.createNestApplication({ logger: false })
        app.use((req: Request, _res: Response, next: NextFunction) => {
            setAuthPrincipal(req, {
                credentialKind: 'human_session',
                issuer: 'urn:lead-email-finder:auth',
                subject: 'native-user',
                organizationId: 'organization',
                membershipRole: 'member',
                permissions: [],
                credentialId: 'identity',
            })
            next()
        })
        app.useGlobalPipes(new ValidationPipe())
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(new Reflector(), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()
    })
    beforeEach(() => {
        jest.resetAllMocks()
        state.read.mockResolvedValue({ state: 'signed_out' })
        sessions.read.mockResolvedValue({ nativeUserId: 'native-user', sessionId: 'native-session' })
    })
    afterAll(async () => app.close())

    it('returns exactly safe state and bootstraps CSRF without leaking native identity fields', async () => {
        state.read.mockResolvedValue({
            state: 'organization_setup_required',
            nativeUserId: 'secret-id',
            token: 'secret-token',
        })
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('Cookie', 'lef_session=native-credential')
            .expect(200)
        expect(response.body).toEqual({ state: 'organization_setup_required' })
        expect(state.read).toHaveBeenCalledWith('native-credential')
        expect(response.headers['set-cookie']).toEqual([
            expect.stringMatching(/^lef_csrf_token=.+; Max-Age=2; Path=\/; Expires=.+; SameSite=Lax$/),
        ])
    })

    it('preserves the existing CSRF cookie on normal state reads', async () => {
        state.read.mockResolvedValue({ state: 'authenticated' })
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('Cookie', nativeCookie)
            .expect(200)
        expect(response.headers['set-cookie']).toBeUndefined()
    })

    it('expires CSRF for an unusable native session', async () => {
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('Cookie', nativeCookie)
            .expect(200)
        expect(response.body).toEqual({ state: 'signed_out' })
        expect(response.headers['set-cookie']).toEqual([
            expect.stringContaining('lef_csrf_token=; Path=/; Expires=Thu, 01 Jan 1970'),
        ])
    })

    it('forwards every renewal cookie independently even when the native read fails', async () => {
        state.read.mockImplementation(() => {
            const headers = new Headers()
            headers.append('Set-Cookie', 'lef_session=renewed; HttpOnly')
            headers.append('Set-Cookie', 'auxiliary=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
            nativeSessionCookieEffects.capture(headers)
            throw new Error('provider-sensitive-secret')
        })
        const response = await request(app.getHttpServer()).get('/v1/auth/sign-in-state').expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
        expect(response.headers['set-cookie']).toEqual([
            'lef_session=renewed; HttpOnly',
            'auxiliary=; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ])
    })

    it.each([
        ['magic-link/request', { email: 'person@example.test' }],
        ['magic-link/verify', { token: 'one-time' }],
    ])('requires exact Origin before %s and keeps the pending workflow unavailable', async (path, body) => {
        await request(app.getHttpServer()).post(`/v1/auth/${path}`).send(body).expect(403)
        await request(app.getHttpServer())
            .post(`/v1/auth/${path}`)
            .set('Origin', 'https://evil.example.test')
            .set('Referer', origin)
            .send(body)
            .expect(403)
        const response = await request(app.getHttpServer())
            .post(`/v1/auth/${path}`)
            .set('Origin', origin)
            .send(body)
            .expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
        expect(response.headers['set-cookie']).toBeUndefined()
    })

    it('allows same-origin Referer fallback for an anonymous first factor', async () => {
        await request(app.getHttpServer())
            .post('/v1/auth/magic-link/request')
            .set('Referer', `${origin}/auth/sign-in`)
            .send({ email: ' Person@Example.test ' })
            .expect(503)
    })

    it.each([
        ['magic-link/request', { email: 'invalid' }],
        ['magic-link/verify', { token: 'valid', destination: '/app/override' }],
        ['magic-link/request', { email: 'person@example.test', mfaVerifiedAt: 1 }],
        ['mfa/verify', { code: '123456', trustDevice: true }],
        ['mfa/recover', { code: '' }],
        ['mfa/enroll', { password: 'not-supported' }],
        ['logout', { sessionId: 'not-authority' }],
    ])('rejects unsupported or invalid fields on %s', async (path, body) => {
        await request(app.getHttpServer())
            .post(`/v1/auth/${path}`)
            .set('Origin', origin)
            .set('Cookie', nativeCookie)
            .set('x-csrf-token', 'csrf')
            .send(body)
            .expect(400)
    })

    it.each([
        ['mfa/enroll', {}],
        ['mfa/verify', { code: '123456' }],
        ['mfa/recover', { code: 'recovery-code' }],
        ['logout', {}],
    ])('checks real limited-session context and CSRF before %s; never claims success', async (path, body) => {
        await request(app.getHttpServer()).post(`/v1/auth/${path}`).set('Origin', origin).send(body).expect(401)
        await request(app.getHttpServer())
            .post(`/v1/auth/${path}`)
            .set('Origin', origin)
            .set('Cookie', nativeCookie)
            .send(body)
            .expect(403)
        const response = await request(app.getHttpServer())
            .post(`/v1/auth/${path}`)
            .set('Origin', origin)
            .set('Cookie', nativeCookie)
            .set('x-csrf-token', 'csrf')
            .send(body)
            .expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
        expect(sessions.read).toHaveBeenCalledWith('native-credential')
        expect(response.headers['set-cookie']).toBeUndefined()
    })

    it.each([
        '/v1/auth/login',
        '/v1/auth/callback',
        '/api/auth/get-session',
        '/api/auth/sign-in/magic-link',
        '/v1/auth/two-factor/disable',
    ])('does not expose legacy or raw native route %s', async path => {
        await request(app.getHttpServer()).get(path).expect(404)
    })

    it('retains the current-account service projection and exact 401/403 documents', async () => {
        const projection = {
            email: null,
            membership: { id: 'membership', role: 'member' },
            organization: { id: 'organization', name: 'Workspace' },
            capabilities: [],
            grantableServiceClientPermissions: [],
        }
        account.get.mockResolvedValue(projection)
        const success = await request(app.getHttpServer()).get('/v1/auth/session').expect(200)
        expect(success.body).toEqual(projection)
        expect(success.headers['set-cookie']).toEqual([expect.stringMatching(/^lef_csrf_token=/)])
        const existing = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('Cookie', nativeCookie)
            .expect(200)
        expect(existing.headers['set-cookie']).toBeUndefined()
        account.get.mockRejectedValue(new HumanSessionRequiredError())
        expect((await request(app.getHttpServer()).get('/v1/auth/session').expect(403)).body).toEqual({
            code: 'human_session_required',
        })
        account.get.mockRejectedValue(new CurrentAccountUnavailableError())
        expect((await request(app.getHttpServer()).get('/v1/auth/session').expect(401)).body).toEqual({
            code: 'authentication_required',
        })
    })
    it('redacts unexpected account persistence failures as the safe authentication 503', async () => {
        account.get.mockRejectedValue(new Error('provider-database-sensitive-detail'))
        const response = await request(app.getHttpServer()).get('/v1/auth/session').expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
        expect(response.headers['set-cookie']).toBeUndefined()
    })

})
