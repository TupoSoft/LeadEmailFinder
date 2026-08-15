import { Controller, Get, INestApplication, Module, UnauthorizedException } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationService } from './application/authentication.service'
import { AuthGuard } from './infrastructure/http/auth.guard'
import { CurrentPrincipal } from './infrastructure/http/current-principal.decorator'
import { Public } from './infrastructure/http/public.decorator'

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
}

@Module({
    controllers: [AuthIntegrationTestController],
    providers: [
        Reflector,
        { provide: AuthenticationService, useValue: authenticationServiceMock },
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
})
class AuthIntegrationTestModule {}

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
            credentialKind: 'legacy_api_key',
            issuer: 'internal:legacy-api-key',
            subject: 'key-id',
            organizationId: 'org-id',
            membershipRole: 'member',
            permissions: [],
            credentialId: 'key-id',
        } as const satisfies AuthPrincipal
        authenticationServiceMock.authenticate.mockResolvedValue(principal)

        const response = await request(app.getHttpServer())
            .get('/auth-integration-test/protected')
            .set('x-api-key', 'irrelevant-because-authenticate-is-mocked')
            .expect(200)

        expect(response.body).toEqual(principal)
    })
})
