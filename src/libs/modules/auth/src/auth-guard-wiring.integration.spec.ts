import { Controller, Get, INestApplication, Module, UseGuards } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { ActiveServiceCredentialReader, AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { ApiKeyCredentialAuthenticator } from './application/api-key-credential-authenticator'
import { AuthenticationService } from './application/authentication.service'
import { CredentialRejectedError } from './application/credential-authenticator'
import { CredentialExtractor } from './application/credential-extractor'
import { RolePermissionPolicy } from './application/role-permission-policy.service'
import { AuthGuard } from './api/auth.guard'
import { CurrentPrincipal } from './api/current-principal.decorator'
import { PermissionsGuard } from './api/permissions.guard'
import { Public } from './api/public.decorator'
import { RequirePermissions } from './api/require-permissions.decorator'

const authenticationServiceMock: jest.Mocked<Pick<AuthenticationService, 'authenticate'>> = {
    authenticate: jest.fn(),
}

@Controller('auth-integration-test')
class AuthIntegrationTestController {
    @Public()
    @Get('public')
    getPublic(): { ok: boolean } {
        return { ok: true }
    }

    @Get('protected')
    getProtected(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
    }

    @UseGuards(PermissionsGuard)
    @RequirePermissions('platform:admin')
    @Get('admin-only')
    getAdminOnly(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
    }

    @UseGuards(PermissionsGuard)
    @RequirePermissions('members:manage')
    @Get('members-managed')
    getMembersManaged(@CurrentPrincipal() principal: AuthPrincipal): AuthPrincipal {
        return principal
    }
}

@Module({
    controllers: [AuthIntegrationTestController],
    providers: [
        Reflector,
        RolePermissionPolicy,
        PermissionsGuard,
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
class AuthIntegrationTestModule {}

function principalWith(overrides: Partial<AuthPrincipal>): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer',
        subject: 'human-1',
        organizationId: 'org-id',
        membershipRole: 'member',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

function authenticationServiceUsing(reader: ActiveServiceCredentialReader): AuthenticationService {
    return new AuthenticationService(new CredentialExtractor(), [new ApiKeyCredentialAuthenticator(reader, key => key)])
}

describe('AuthGuard + CurrentPrincipal wiring', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [AuthIntegrationTestModule],
        }).compile()

        app = moduleRef.createNestApplication({ logger: false })
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('allows a @Public() route without invoking authentication', async () => {
        await request(app.getHttpServer()).get('/auth-integration-test/public').expect(200, { ok: true })

        expect(authenticationServiceMock.authenticate).not.toHaveBeenCalled()
    })

    it('rejects a protected route with the stable code-only response when authentication fails', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(
            new CredentialRejectedError('Authentication credential is missing'),
        )

        await request(app.getHttpServer())
            .get('/auth-integration-test/protected')
            .expect(401, { code: 'authentication_required' })
    })

    it('treats malformed session-cookie encoding as an exact code-only 401 without leaking the parser error', async () => {
        const authenticationService = new AuthenticationService(new CredentialExtractor(), [])
        authenticationServiceMock.authenticate.mockImplementation(headers =>
            authenticationService.authenticate(headers),
        )

        await request(app.getHttpServer())
            .get('/auth-integration-test/protected')
            .set('cookie', 'lef_session=%ZZ')
            .expect(401, { code: 'authentication_required' })
    })

    it('resolves @CurrentPrincipal() from the authenticated request', async () => {
        const principal = {
            credentialKind: 'human_session',
            issuer: 'https://issuer',
            subject: 'human-1',
            organizationId: 'org-id',
            membershipRole: 'member',
            permissions: [],
            credentialId: 'identity-1',
        } as const satisfies AuthPrincipal
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .get('/auth-integration-test/protected')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(200)

        expect(response.body).toEqual(principal)
    })

    it('rejects a legacy JWT with 401 before persistence lookup', async () => {
        const reader = { findByKeyHash: jest.fn(), findByIssuerAndSubject: jest.fn() }
        const authenticationService = authenticationServiceUsing(reader)
        authenticationServiceMock.authenticate.mockImplementation(headers =>
            authenticationService.authenticate(headers),
        )
        await request(app.getHttpServer())
            .get('/auth-integration-test/admin-only')
            .set('authorization', 'Bearer header.payload.signature')
            .expect(401, { code: 'authentication_required' })
        expect(reader.findByKeyHash).not.toHaveBeenCalled()
    })

    it('preserves an unexpected persistence fault as a redacted 500', async () => {
        const reader = {
            findByKeyHash: jest.fn().mockRejectedValue(new Error('private database fault')),
            findByIssuerAndSubject: jest.fn(),
        }
        const authenticationService = authenticationServiceUsing(reader)
        authenticationServiceMock.authenticate.mockImplementation(headers =>
            authenticationService.authenticate(headers),
        )
        await request(app.getHttpServer())
            .get('/auth-integration-test/protected')
            .set('authorization', `Bearer lef_${'a'.repeat(43)}`)
            .expect(500, { statusCode: 500, message: 'Internal server error' })
    })

    it('rejects a member-role principal from a platform:admin-gated route with 403 (privilege escalation)', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalWith({ membershipRole: 'member' }))

        await request(app.getHttpServer())
            .get('/auth-integration-test/admin-only')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(403)
    })

    it('rejects a narrow-scope service_client principal from a members:manage-gated route with 403 (privilege escalation)', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(
            principalWith({
                credentialKind: 'service_client',
                membershipRole: 'admin',
                permissions: ['verification:run'],
            }),
        )

        await request(app.getHttpServer())
            .get('/auth-integration-test/members-managed')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(403)
    })

    it('allows a platform_admin principal through every permission-gated route', async () => {
        authenticationServiceMock.authenticate.mockResolvedValue(principalWith({ membershipRole: 'platform_admin' }))

        await request(app.getHttpServer())
            .get('/auth-integration-test/admin-only')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(200)

        await request(app.getHttpServer())
            .get('/auth-integration-test/members-managed')
            .set('authorization', 'Bearer irrelevant-because-authenticate-is-mocked')
            .expect(200)
    })
})
