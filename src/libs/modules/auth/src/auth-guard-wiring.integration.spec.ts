import { Controller, Get, INestApplication, Module, UnauthorizedException, UseGuards } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from './application/authentication.service'
import { RolePermissionPolicy } from './application/role-permission-policy.service'
import { AuthGuard } from './infrastructure/http/auth.guard'
import { CurrentPrincipal } from './infrastructure/http/current-principal.decorator'
import { PermissionsGuard } from './infrastructure/http/permissions.guard'
import { Public } from './infrastructure/http/public.decorator'
import { RequirePermissions } from './infrastructure/http/require-permissions.decorator'

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

describe('AuthGuard + CurrentPrincipal wiring', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [AuthIntegrationTestModule],
        }).compile()

        app = moduleRef.createNestApplication()
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

    it('rejects a protected route when authentication fails', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

        await request(app.getHttpServer()).get('/auth-integration-test/protected').expect(401)
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

    it('rejects an unauthenticated request to a permission-gated route with 401, not 403', async () => {
        authenticationServiceMock.authenticate.mockRejectedValue(new UnauthorizedException('missing credential'))

        await request(app.getHttpServer()).get('/auth-integration-test/admin-only').expect(401)
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
            principalWith({ credentialKind: 'service_client', membershipRole: 'admin', permissions: ['verification:run'] }),
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
