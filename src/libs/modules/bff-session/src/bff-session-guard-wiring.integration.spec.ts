import { ClassSerializerInterceptor, INestApplication, Module, UnauthorizedException } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from '@tuposoft/lead-email-finder/modules/auth/application/authentication.service'
import { AuthGuard } from '@tuposoft/lead-email-finder/modules/auth/infrastructure/http/auth.guard'
import { BFF_SESSION_COOKIE_NAME } from '@tuposoft/lead-email-finder/modules/auth/application/credential-extractor'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './infrastructure/config/bff-session-configuration'
import { BFF_CSRF_COOKIE_NAME } from './infrastructure/http/bff-cookie-names'
import { BffSessionController } from './infrastructure/http/bff-session.controller'
import { CsrfGuard } from './infrastructure/http/csrf.guard'
import { OriginGuard } from './infrastructure/http/origin.guard'

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
    controllers: [BffSessionController],
    providers: [
        Reflector,
        OriginGuard,
        CsrfGuard,
        { provide: BffSessionFlowService, useValue: bffSessionFlowMock },
        { provide: BFF_SESSION_CONFIGURATION, useValue: configuration },
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
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
})
