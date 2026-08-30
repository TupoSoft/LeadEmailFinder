import {
    ClassSerializerInterceptor,
    Controller,
    INestApplication,
    Module,
    Post,
    SerializeOptions,
    UnauthorizedException,
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService, AuthGuard, BFF_SESSION_COOKIE_NAME, CurrentPrincipal, Public } from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './application/bff-session-configuration'
import { BFF_CSRF_COOKIE_NAME } from './api/bff-cookie-names'
import { BffSessionController } from './api/bff-session.controller'
import { BrowserSessionMutationGuard } from './api/browser-session-mutation.guard'
import { SessionResponseDto } from './api/bff-session.dto'
import { CsrfGuard } from './api/csrf.guard'
import { OriginGuard } from './api/origin.guard'

@Controller('mutation-probe')
class MutationProbeController {
    @Public()
    @Post('public')
    publicMutate(): { ok: boolean } {
        return { ok: true }
    }

    @Post('protected')
    @SerializeOptions({ type: SessionResponseDto })
    protectedMutate(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
    }
}

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}
const bffSessionFlowMock: jest.Mocked<Pick<BffSessionFlowService, 'login' | 'handleCallback' | 'logout'>> = {
    login: jest.fn(),
    handleCallback: jest.fn(),
    logout: jest.fn(),
}

const configuration: BffSessionConfiguration = {
    appBaseUrl: 'http://localhost:53000',
    issuer: 'https://issuer',
    clientId: 'lef-web-bff',
    clientSecret: 'secret',
    sessionIdleTimeoutMs: 1000,
    sessionAbsoluteTimeoutMs: 2000,
    isSecureCookie: false,
}

function principalFixture(): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-1',
        membershipRole: 'member',
        permissions: [],
        credentialId: 'identity-1',
    }
}

@Module({
    controllers: [BffSessionController, MutationProbeController],
    providers: [
        Reflector,
        OriginGuard,
        CsrfGuard,
        BrowserSessionMutationGuard,
        { provide: BffSessionFlowService, useValue: bffSessionFlowMock },
        { provide: BFF_SESSION_CONFIGURATION, useValue: configuration },
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useExisting: BrowserSessionMutationGuard },
    ],
})
class BffSessionGuardWiringTestModule {}

describe('BFF session guard wiring', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [BffSessionGuardWiringTestModule],
        }).compile()

        app = moduleRef.createNestApplication()
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), { strategy: 'excludeAll', enableImplicitConversion: true }),
        )
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('rejects GET /v1/auth/session with 401 when there is no session', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

        await request(app.getHttpServer()).get('/v1/auth/session').expect(401)
    })

    it('returns the principal for an authenticated GET /v1/auth/session', async () => {
        const principal = principalFixture()
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(200)

        expect(response.body).toEqual(principal)
    })

    it('rejects POST /v1/auth/logout with 401 when unauthenticated', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

        await request(app.getHttpServer()).post('/v1/auth/logout').expect(401)
    })

    it('rejects an authenticated POST /v1/auth/logout with 403 when Origin and Referer are both missing', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id; ${BFF_CSRF_COOKIE_NAME}=csrf-token`)
            .set('x-csrf-token', 'csrf-token')
            .expect(403)

        expect(bffSessionFlowMock.logout).not.toHaveBeenCalled()
    })

    it('rejects an authenticated POST /v1/auth/logout with 403 when the CSRF token is missing', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', 'http://localhost:53000')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(403)

        expect(bffSessionFlowMock.logout).not.toHaveBeenCalled()
    })

    it('rejects an authenticated POST /v1/auth/logout with 403 when the CSRF header does not match the cookie', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', 'http://localhost:53000')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id; ${BFF_CSRF_COOKIE_NAME}=csrf-token`)
            .set('x-csrf-token', 'a-different-token')
            .expect(403)

        expect(bffSessionFlowMock.logout).not.toHaveBeenCalled()
    })

    it('allows an authenticated POST /v1/auth/logout with a matching Origin and CSRF token', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
        bffSessionFlowMock.logout.mockResolvedValue(undefined)

        await request(app.getHttpServer())
            .post('/v1/auth/logout')
            .set('origin', 'http://localhost:53000')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id; ${BFF_CSRF_COOKIE_NAME}=csrf-token`)
            .set('x-csrf-token', 'csrf-token')
            .expect(204)

        expect(bffSessionFlowMock.logout).toHaveBeenCalledWith('session-id')
    })

    it('allows a @Public() mutation without authentication, origin, or CSRF checks', async () => {
        await request(app.getHttpServer()).post('/mutation-probe/public').expect(201)

        expect(authenticationServiceMock.authenticate).not.toHaveBeenCalled()
    })

    it('rejects an authenticated human_session mutation with 403 when Origin and CSRF are missing', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())

        await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(403)
    })

    it('allows an authenticated human_session mutation with a matching Origin and CSRF token', async () => {
        const principal = principalFixture()
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('origin', 'http://localhost:53000')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id; ${BFF_CSRF_COOKIE_NAME}=csrf-token`)
            .set('x-csrf-token', 'csrf-token')
            .expect(201)

        expect(response.body).toEqual(principal)
    })

    it('allows an authenticated service_client bearer mutation without an Origin or CSRF token', async () => {
        const principal: AuthPrincipal = { ...principalFixture(), credentialKind: 'service_client' }
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(201)

        expect(response.body).toEqual(principal)
    })
})
