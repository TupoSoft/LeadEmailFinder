import { ClassSerializerInterceptor, Controller, INestApplication, Post, SerializeOptions } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Expose } from 'class-transformer'
import request from 'supertest'
import {
    ActiveMembershipReader,
    AuthPrincipal,
    CurrentAccountReader,
    OrganizationMembershipRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    AuthenticationService,
    AuthGuard,
    CredentialAuthenticator,
    CredentialExtractor,
    CredentialRejectedError,
    Public,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { BFF_SESSION_CONFIGURATION } from './application/bff-session-configuration'
import { BrowserCapabilityPolicy } from './application/browser-capability-policy'
import { CurrentAccountService } from './application/current-account.service'
import { NativeSignInStateService } from './application/native-sign-in-state.service'
import {
    VERIFIED_HUMAN_SESSION_READER,
    VerifiedHumanSession,
    VerifiedHumanSessionReader,
} from './application/verified-human-session-reader'
import { BffSessionController } from './api/bff-session.controller'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { CsrfGuard } from './api/csrf.guard'
import { OriginGuard } from './api/origin.guard'

class MutationProbeResponseDto {
    @Expose()
    ok: boolean
}

@Controller('mutation-probe')
class MutationProbeController {
    @Public()
    @Post('public')
    publicMutate(): { ok: boolean } {
        return { ok: true }
    }

    @Post('protected')
    @SerializeOptions({ type: MutationProbeResponseDto })
    protectedMutate(): MutationProbeResponseDto {
        return { ok: true }
    }
}

const nativeSession: VerifiedHumanSession = {
    nativeUserId: 'native-human',
    externalIdentityId: 'identity-1',
    email: 'member@example.test',
    emailVerified: true,
    sessionId: 'native-session',
    createdAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60_000,
    absoluteExpiresAt: Date.now() + 86_400_000,
    mfaVerifiedAt: 0,
}
const member: OrganizationMembershipRecord = {
    id: 'membership-1',
    externalIdentityId: 'identity-1',
    organizationId: 'org-1',
    role: 'member',
    status: 'active',
}
const machine: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'urn:lead-email-finder:auth',
    subject: 'key-1',
    organizationId: 'org-1',
    membershipRole: 'member',
    permissions: [],
    credentialId: 'key-1',
}

describe('Native BFF business authentication and mutation guard wiring', () => {
    let app: INestApplication
    const sessions: jest.Mocked<VerifiedHumanSessionReader> = { read: jest.fn() }
    const memberships: jest.Mocked<ActiveMembershipReader> = {
        findForExternalIdentity: jest.fn(),
        findActiveForExternalIdentity: jest.fn(),
        findByOrganizationAndExternalIdentity: jest.fn(),
    }
    const account: jest.Mocked<CurrentAccountReader> = { read: jest.fn() }
    const machineAuthenticator: jest.Mocked<CredentialAuthenticator> = {
        supports: jest.fn(credential => credential.scheme === 'bearer'),
        authenticate: jest.fn(),
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [BffSessionController, MutationProbeController],
            providers: [
                Reflector,
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
                { provide: VERIFIED_HUMAN_SESSION_READER, useValue: sessions },
                {
                    provide: NativeSignInStateService,
                    useValue: new NativeSignInStateService(sessions, memberships, {
                        read: jest.fn().mockResolvedValue({ authenticatorEnrolled: false }),
                    }),
                },
                {
                    provide: CurrentAccountService,
                    useValue: new CurrentAccountService(account, new BrowserCapabilityPolicy(), {
                        grantablePermissionsFor: () => [],
                    }),
                },
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [
                        machineAuthenticator,
                        new BffSessionCredentialAuthenticator(sessions, memberships),
                    ]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
                { provide: APP_GUARD, useExisting: BrowserSessionMutationGuard },
            ],
        }).compile()
        app = moduleRef.createNestApplication({ logger: false })
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    beforeEach(() => {
        jest.clearAllMocks()
        sessions.read.mockResolvedValue(nativeSession)
        memberships.findForExternalIdentity.mockResolvedValue([member])
        account.read.mockResolvedValue({
            email: 'member@example.test',
            membership: { id: 'membership-1', role: 'member' },
            organization: { id: 'org-1', name: 'Example Organization' },
        })
        machineAuthenticator.authenticate.mockResolvedValue(machine)
    })

    it('preserves the exact unauthenticated current-account 401', async () => {
        const response = await request(app.getHttpServer()).get('/v1/auth/session').expect(401)
        expect(response.body).toEqual({ code: 'authentication_required' })
    })

    it('rejects an unusable native session through the real authentication chain', async () => {
        sessions.read.mockResolvedValue(undefined)
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', 'lef_session=expired')
            .expect(401)
        expect(response.body).toEqual({ code: 'authentication_required' })
        expect(memberships.findForExternalIdentity).not.toHaveBeenCalled()
    })

    it('returns the existing safe current-account document', async () => {
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(response.body).toEqual({
            email: 'member@example.test',
            membership: { id: 'membership-1', role: 'member' },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: ['verification.run', 'verification.read'],
            grantableServiceClientPermissions: [],
        })
    })

    it('preserves nullable email in the current-account projection', async () => {
        account.read.mockResolvedValue({
            email: null,
            membership: { id: 'membership-1', role: 'member' },
            organization: { id: 'org-1', name: 'Example Organization' },
        })
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', 'lef_session=native')
            .expect(200)
        expect(response.body).toMatchObject({ email: null })
    })

    it('preserves the exact machine current-account 403 and key precedence', async () => {
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('authorization', 'Bearer machine-key')
            .set('cookie', 'lef_session=native')
            .expect(403)
        expect(response.body).toEqual({ code: 'human_session_required' })
        expect(sessions.read).not.toHaveBeenCalled()
        expect(account.read).not.toHaveBeenCalled()
    })

    it('never falls back to a cookie after supplied machine-key rejection', async () => {
        machineAuthenticator.authenticate.mockRejectedValue(new CredentialRejectedError('unknown key'))
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('authorization', 'Bearer invalid-key')
            .set('cookie', 'lef_session=native')
            .expect(401)
        expect(response.body).toEqual({ code: 'authentication_required' })
        expect(sessions.read).not.toHaveBeenCalled()
    })

    it('observes membership promotion and disablement on the next request', async () => {
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', 'lef_session=native').expect(200)
        memberships.findForExternalIdentity.mockResolvedValue([{ ...member, role: 'owner' }])
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', 'lef_session=native').expect(401)
        memberships.findForExternalIdentity.mockResolvedValue([{ ...member, status: 'disabled' }])
        await request(app.getHttpServer()).get('/v1/auth/session').set('cookie', 'lef_session=native').expect(401)
    })

    it('preserves the exact post-authentication unavailable-account 401', async () => {
        account.read.mockResolvedValue(undefined)
        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', 'lef_session=native')
            .expect(401)
        expect(response.body).toEqual({ code: 'authentication_required' })
    })

    it('keeps Origin and CSRF mandatory on cookie-authenticated business mutations', async () => {
        await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('cookie', 'lef_session=native')
            .expect(403)
        await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('origin', 'http://localhost:53000')
            .set('cookie', 'lef_session=native; lef_csrf_token=csrf')
            .expect(403)
        await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('origin', 'http://localhost:53000')
            .set('cookie', 'lef_session=native; lef_csrf_token=csrf')
            .set('x-csrf-token', 'wrong')
            .expect(403)
        const response = await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('origin', 'http://localhost:53000')
            .set('cookie', 'lef_session=native; lef_csrf_token=csrf')
            .set('x-csrf-token', 'csrf')
            .expect(201)
        expect(response.body).toEqual({ ok: true })
    })

    it('permits machine business mutations without browser CSRF', async () => {
        await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('authorization', 'Bearer machine-key')
            .expect(201)
        expect(sessions.read).not.toHaveBeenCalled()
    })

    it('keeps unrelated public routes unauthenticated', async () => {
        await request(app.getHttpServer()).post('/mutation-probe/public').expect(201)
        expect(sessions.read).not.toHaveBeenCalled()
    })
})
