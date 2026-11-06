import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ActiveMembershipReader, OrganizationMembershipRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { BffSessionController } from './api/bff-session.controller'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { CsrfGuard } from './api/csrf.guard'
import { OriginGuard } from './api/origin.guard'
import { BFF_SESSION_CONFIGURATION } from './application/bff-session-configuration'
import { CurrentAccountService } from './application/current-account.service'
import { NativeSignInStateService } from './application/native-sign-in-state.service'
import {
    NATIVE_HUMAN_AUTH_FACTS_READER,
    NativeHumanAuthFactsReader,
    VERIFIED_HUMAN_SESSION_READER,
    VerifiedHumanSession,
    VerifiedHumanSessionReader,
} from './application/verified-human-session-reader'

const session: VerifiedHumanSession = {
    nativeUserId: 'native-human',
    externalIdentityId: 'identity-1',
    email: 'person@example.test',
    emailVerified: true,
    sessionId: 'native-session',
    createdAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60_000,
    absoluteExpiresAt: Date.now() + 86_400_000,
    mfaVerifiedAt: 0,
}
const member: OrganizationMembershipRecord = {
    id: 'membership-1',
    organizationId: 'org-1',
    externalIdentityId: 'identity-1',
    role: 'member',
    status: 'active',
}

describe('Native BFF narrow authentication HTTP boundary', () => {
    let app: INestApplication
    const reader: jest.Mocked<VerifiedHumanSessionReader> = { read: jest.fn() }
    const facts: jest.Mocked<NativeHumanAuthFactsReader> = { read: jest.fn() }
    const memberships: jest.Mocked<ActiveMembershipReader> = {
        findForExternalIdentity: jest.fn(),
        findActiveForExternalIdentity: jest.fn(),
        findByOrganizationAndExternalIdentity: jest.fn(),
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [BffSessionController],
            providers: [
                OriginGuard,
                CsrfGuard,
                BrowserSessionMutationGuard,
                {
                    provide: BFF_SESSION_CONFIGURATION,
                    useValue: {
                        appBaseUrl: 'http://localhost:53000',
                        isSecureCookie: false,
                        sessionIdleTimeoutMs: 28_800_000,
                        sessionAbsoluteTimeoutMs: 86_400_000,
                    },
                },
                { provide: VERIFIED_HUMAN_SESSION_READER, useValue: reader },
                { provide: NATIVE_HUMAN_AUTH_FACTS_READER, useValue: facts },
                {
                    provide: NativeSignInStateService,
                    useValue: new NativeSignInStateService(reader, memberships, facts),
                },
                { provide: CurrentAccountService, useValue: { get: jest.fn() } },
            ],
        }).compile()
        app = moduleRef.createNestApplication({ logger: false })
        app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    beforeEach(() => {
        jest.clearAllMocks()
        reader.read.mockResolvedValue(session)
        facts.read.mockResolvedValue({ authenticatorEnrolled: false })
        memberships.findForExternalIdentity.mockResolvedValue([member])
    })

    it.each([
        '/v1/auth/login',
        '/v1/auth/callback',
        '/api/auth/get-session',
        '/api/auth/verify-magic-link',
        '/v1/auth/two-factor/disable',
    ])('does not expose the legacy or raw native endpoint %s', async path => {
        await request(app.getHttpServer()).get(path).expect(404)
        expect(reader.read).not.toHaveBeenCalled()
    })

    it('returns only signed_out and clears CSRF for an anonymous state read', async () => {
        const response = await request(app.getHttpServer()).get('/v1/auth/sign-in-state').expect(200)
        expect(response.body).toEqual({ state: 'signed_out' })
        expect(response.headers['set-cookie'][0]).toMatch(/^lef_csrf_token=;/)
        expect(reader.read).not.toHaveBeenCalled()
    })

    it('returns only authenticated and bootstraps a missing CSRF cookie', async () => {
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(response.body).toEqual({ state: 'authenticated' })
        expect(response.headers['set-cookie'][0]).toMatch(/^lef_csrf_token=[A-Za-z0-9_-]+;/)
    })

    it('preserves the existing CSRF token during ordinary state bootstrap', async () => {
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native; lef_csrf_token=existing')
            .expect(200)
        expect(response.headers['set-cookie']).toBeUndefined()
    })

    it('distinguishes genuine no-membership identities from disabled accounts', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([])
        const setup = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(setup.body).toEqual({ state: 'organization_setup_required' })
        memberships.findForExternalIdentity.mockResolvedValue([{ ...member, status: 'disabled' }])
        const disabled = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(401)
        expect(disabled.body).toEqual({ code: 'authentication_required' })
    })

    it('routes privileged sessions through enrollment or verification without exposing factor facts', async () => {
        memberships.findForExternalIdentity.mockResolvedValue([{ ...member, role: 'owner' }])
        const enroll = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(enroll.body).toEqual({ state: 'mfa_enrollment_required' })
        facts.read.mockResolvedValue({ authenticatorEnrolled: true })
        const verify = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(verify.body).toEqual({ state: 'mfa_verification_required' })
    })

    it.each([
        ['/v1/auth/magic-link/request', { email: 'person@example.test' }],
        ['/v1/auth/magic-link/verify', { token: 'native-token' }],
    ])('requires exact Origin and leaves pending first-factor workflow unavailable at %s', async (path, body) => {
        await request(app.getHttpServer()).post(path).send(body).expect(403)
        const response = await request(app.getHttpServer())
            .post(path)
            .set('origin', 'http://localhost:53000')
            .send(body)
            .expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
        expect(reader.read).not.toHaveBeenCalled()
    })

    it.each([
        ['/v1/auth/mfa/enroll', {}],
        ['/v1/auth/mfa/verify', { code: '123456' }],
        ['/v1/auth/mfa/recover', { code: 'recovery-code' }],
        ['/v1/auth/logout', {}],
    ])('requires a verified native session and double-submit CSRF before pending mutation %s', async (path, body) => {
        const anonymous = await request(app.getHttpServer())
            .post(path)
            .set('origin', 'http://localhost:53000')
            .send(body)
            .expect(401)
        expect(anonymous.body).toEqual({ code: 'authentication_required' })
        await request(app.getHttpServer())
            .post(path)
            .set('origin', 'http://localhost:53000')
            .set('cookie', 'lef_session=native')
            .send(body)
            .expect(403)
        const pending = await request(app.getHttpServer())
            .post(path)
            .set('origin', 'http://localhost:53000')
            .set('cookie', 'lef_session=native; lef_csrf_token=csrf')
            .set('x-csrf-token', 'csrf')
            .send(body)
            .expect(503)
        expect(pending.body).toEqual({ code: 'authentication_unavailable' })
    })

    it('rejects browser authority fields before native calls', async () => {
        await request(app.getHttpServer())
            .post('/v1/auth/mfa/verify')
            .set('origin', 'http://localhost:53000')
            .send({ code: '123456', trustDevice: true, mfaVerifiedAt: Date.now() })
            .expect(400)
        await request(app.getHttpServer())
            .post('/v1/auth/magic-link/verify')
            .set('origin', 'http://localhost:53000')
            .send({ token: 'native-token', destination: '/app/untrusted' })
            .expect(400)
        expect(reader.read).not.toHaveBeenCalled()
    })

    it('redacts native and membership infrastructure failures', async () => {
        reader.read.mockRejectedValue(new Error('private native database credentials'))
        const response = await request(app.getHttpServer())
            .get('/v1/auth/sign-in-state')
            .set('cookie', 'lef_session=native')
            .expect(503)
        expect(response.body).toEqual({ code: 'authentication_unavailable' })
    })
})
