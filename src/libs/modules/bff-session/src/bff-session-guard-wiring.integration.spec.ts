import {
    ClassSerializerInterceptor,
    Controller,
    INestApplication,
    Module,
    Post,
    SerializeOptions,
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { Expose } from 'class-transformer'
import request from 'supertest'
import {
    CURRENT_ACCOUNT_READER,
    AuthPrincipal,
    CurrentAccountReader,
    CurrentAccountRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    SERVICE_CLIENT_GRANT_POLICY,
    AuthenticationService,
    AuthGuard,
    BFF_SESSION_COOKIE_NAME,
    CredentialExtractor,
    CredentialRejectedError,
    Public,
    ServiceClientGrantPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionFlowService } from './application/bff-session-flow.service'
import { BffSessionCredentialAuthenticator } from './application/bff-session-credential-authenticator'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from './application/bff-session-configuration'
import { BrowserCapabilityPolicy } from './application/browser-capability-policy'
import { CurrentAccountService } from './application/current-account.service'
import { HumanMembershipResolver } from './application/human-membership-resolver.service'
import { SessionStore } from './application/session-store'
import { SessionTokenRefresher } from './application/session-token-refresher.service'
import { BFF_CSRF_COOKIE_NAME } from './api/bff-cookie-names'
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

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}
const bffSessionFlowMock: jest.Mocked<Pick<BffSessionFlowService, 'login' | 'handleCallback' | 'logout'>> = {
    login: jest.fn(),
    handleCallback: jest.fn(),
    logout: jest.fn(),
}
const currentAccountReaderMock: jest.Mocked<CurrentAccountReader> = {
    read: jest.fn(),
}
const serviceClientGrantPolicyMock: jest.Mocked<ServiceClientGrantPolicy> = {
    grantablePermissionsFor: jest.fn(),
}

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

function currentAccountFixture(overrides: Partial<CurrentAccountRecord> = {}): CurrentAccountRecord {
    return {
        email: 'member@example.test',
        membership: { id: 'membership-1', role: 'member' },
        organization: { id: 'org-1', name: 'Example Organization' },
        ...overrides,
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
        { provide: CURRENT_ACCOUNT_READER, useValue: currentAccountReaderMock },
        { provide: SERVICE_CLIENT_GRANT_POLICY, useValue: serviceClientGrantPolicyMock },
        BrowserCapabilityPolicy,
        {
            provide: CurrentAccountService,
            useFactory: (
                currentAccountReader: CurrentAccountReader,
                browserCapabilityPolicy: BrowserCapabilityPolicy,
                serviceClientGrantPolicy: ServiceClientGrantPolicy,
            ) => new CurrentAccountService(currentAccountReader, browserCapabilityPolicy, serviceClientGrantPolicy),
            inject: [CURRENT_ACCOUNT_READER, BrowserCapabilityPolicy, SERVICE_CLIENT_GRANT_POLICY],
        },
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

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('rejects GET /v1/auth/session with 401 when there is no session', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new CredentialRejectedError('missing credential'))

        const response = await request(app.getHttpServer()).get('/v1/auth/session').expect(401)

        expect(response.body).toEqual({ code: 'authentication_required' })
    })

    it('maps an expired session record to the exact 401 through the real cookie authentication chain', async () => {
        const sessionStore: jest.Mocked<SessionStore> = {
            create: jest.fn(),
            replace: jest.fn(),
            get: jest.fn().mockResolvedValue(undefined),
            save: jest.fn(),
            delete: jest.fn(),
        }
        const sessionTokenRefresher = { refreshIfNeeded: jest.fn() } as unknown as SessionTokenRefresher
        const humanMembershipResolver = { resolveActive: jest.fn() } as unknown as HumanMembershipResolver
        const authenticationService = new AuthenticationService(new CredentialExtractor(), [
            new BffSessionCredentialAuthenticator(sessionStore, sessionTokenRefresher, humanMembershipResolver),
        ])
        authenticationServiceMock.authenticate.mockImplementation(headers => authenticationService.authenticate(headers))

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=expired-session-id`)
            .expect(401)

        expect(response.body).toEqual({ code: 'authentication_required' })
        expect(sessionStore.get).toHaveBeenCalledWith('expired-session-id')
        expect(sessionTokenRefresher.refreshIfNeeded).not.toHaveBeenCalled()
        expect(humanMembershipResolver.resolveActive).not.toHaveBeenCalled()
    })

    it('returns only the exact current-account shape for an authenticated GET /v1/auth/session', async () => {
        const principal = principalFixture()
        authenticationServiceMock.authenticate.mockResolvedValue(principal)
        currentAccountReaderMock.read.mockResolvedValue(currentAccountFixture())
        serviceClientGrantPolicyMock.grantablePermissionsFor.mockReturnValue([])

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(200)

        expect(response.body).toEqual({
            email: 'member@example.test',
            membership: { id: 'membership-1', role: 'member' },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: ['verification.run', 'verification.read'],
            grantableServiceClientPermissions: [],
        })
        for (const internalField of ['credentialKind', 'issuer', 'subject', 'credentialId', 'permissions']) {
            expect(response.body).not.toHaveProperty(internalField)
        }
    })

    it('serializes a null current-account email without fabricating a fallback', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
        currentAccountReaderMock.read.mockResolvedValue(currentAccountFixture({ email: null }))
        serviceClientGrantPolicyMock.grantablePermissionsFor.mockReturnValue([])

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(200)

        expect(response.body).toEqual({
            email: null,
            membership: { id: 'membership-1', role: 'member' },
            organization: { id: 'org-1', name: 'Example Organization' },
            capabilities: ['verification.run', 'verification.read'],
            grantableServiceClientPermissions: [],
        })
    })

    it('returns the exact 403 response for an authenticated service-client bearer', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue({
            ...principalFixture(),
            credentialKind: 'service_client',
        })

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(403)

        expect(response.body).toEqual({ code: 'human_session_required' })
        expect(currentAccountReaderMock.read).not.toHaveBeenCalled()
    })

    it('returns the exact 401 response for post-guard unavailable account state', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
        currentAccountReaderMock.read.mockResolvedValue(undefined)

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(401)

        expect(response.body).toEqual({ code: 'authentication_required' })
    })

    it('keeps unexpected current-account reader faults as redacted 5xx responses', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalFixture())
        currentAccountReaderMock.read.mockRejectedValue(new Error('database host and credentials must stay private'))

        const response = await request(app.getHttpServer())
            .get('/v1/auth/session')
            .set('cookie', `${BFF_SESSION_COOKIE_NAME}=session-id`)
            .expect(500)

        expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
        expect(JSON.stringify(response.body)).not.toContain('database host')
    })

    it('rejects POST /v1/auth/logout with 401 when unauthenticated', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new CredentialRejectedError('missing credential'))

        const response = await request(app.getHttpServer()).post('/v1/auth/logout').expect(401)

        expect(response.body).toEqual({ code: 'authentication_required' })
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

        expect(response.body).toEqual({ ok: true })
    })

    it('allows an authenticated service_client bearer mutation without an Origin or CSRF token', async () => {
        const principal: AuthPrincipal = { ...principalFixture(), credentialKind: 'service_client' }
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .post('/mutation-probe/protected')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(201)

        expect(response.body).toEqual({ ok: true })
    })
})
