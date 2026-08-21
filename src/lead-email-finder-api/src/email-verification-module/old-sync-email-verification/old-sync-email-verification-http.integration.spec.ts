import { ClassSerializerInterceptor, INestApplication, MiddlewareConsumer, Module, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { NextFunction, Request, Response } from 'express'
import { getMapperToken } from '@automapper/nestjs'
import { IEmailVerificationService } from '@tuposoft/lead-email-finder/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard, CreditsService, InsufficientCreditsException } from '../../credits'
import { OldSyncEmailVerificationController } from './old-sync-email-verification.controller'
import { OldSyncEmailVerificationResponseDto } from './old-sync-email-verification-response.dto'

const emailVerificationServiceToken = 'EmailVerificationServiceToken'

const emailVerificationServiceMock: jest.Mocked<Pick<IEmailVerificationService, 'verify'>> = {
    verify: jest.fn(),
}
const creditsServiceMock: jest.Mocked<Pick<CreditsService, 'debit'>> = {
    debit: jest.fn(),
}
const mapperMock = { map: jest.fn() }

let principal: AuthPrincipal | undefined

class FixturePrincipalMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        if (principal) {
            setAuthPrincipal(req, principal)
        }
        next()
    }
}

const readOnlyPrincipal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer',
    subject: 'client-1',
    organizationId: 'org-1',
    membershipRole: 'member',
    permissions: ['verification:read'],
    credentialId: 'cred-1',
}

const runPrincipal: AuthPrincipal = {
    ...readOnlyPrincipal,
    permissions: ['verification:run', 'verification:read'],
}

@Module({
    controllers: [OldSyncEmailVerificationController],
    providers: [
        Reflector,
        RolePermissionPolicy,
        PermissionsGuard,
        CreditGuard,
        { provide: emailVerificationServiceToken, useValue: emailVerificationServiceMock },
        { provide: CreditsService, useValue: creditsServiceMock },
        { provide: getMapperToken(), useValue: mapperMock },
    ],
})
class OldSyncEmailVerificationHttpTestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(FixturePrincipalMiddleware).forRoutes('*')
    }
}

describe('deprecated GET /verify HTTP boundary', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [OldSyncEmailVerificationHttpTestModule],
        }).compile()

        app = moduleRef.createNestApplication()
        app.useGlobalPipes(new ValidationPipe())
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
        principal = undefined
    })

    it('rejects a read-only principal with 403 before verifying or debiting', async () => {
        principal = readOnlyPrincipal

        await request(app.getHttpServer()).get('/verify').query({ email: 'test@example.com' }).expect(403)

        expect(creditsServiceMock.debit).not.toHaveBeenCalled()
        expect(emailVerificationServiceMock.verify).not.toHaveBeenCalled()
    })

    it('rejects an insufficient-credit principal with 402 before verifying', async () => {
        principal = runPrincipal
        creditsServiceMock.debit.mockRejectedValue(new InsufficientCreditsException('org-1'))

        await request(app.getHttpServer()).get('/verify').query({ email: 'test@example.com' }).expect(402)

        expect(emailVerificationServiceMock.verify).not.toHaveBeenCalled()
    })

    it('debits exactly one credit and returns the legacy response on success', async () => {
        principal = runPrincipal
        creditsServiceMock.debit.mockResolvedValue(undefined)
        emailVerificationServiceMock.verify.mockResolvedValue({
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            exists: true,
            catchAll: false,
            reason: 'accepted_email' as never,
            sources: [],
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        })
        const mapped = Object.assign(new OldSyncEmailVerificationResponseDto(), {
            email: 'test@example.com',
            verifiedAt: '2026-01-01T00:00:00.000Z',
        })
        mapperMock.map.mockReturnValue(mapped)

        const response = await request(app.getHttpServer())
            .get('/verify')
            .query({ email: 'test@example.com' })
            .expect(200)

        expect(response.body).toEqual({ email: 'test@example.com', verifiedAt: '2026-01-01T00:00:00.000Z' })
        expect(creditsServiceMock.debit).toHaveBeenCalledTimes(1)
        expect(creditsServiceMock.debit).toHaveBeenCalledWith('org-1', 1, expect.any(String))
        expect(emailVerificationServiceMock.verify).toHaveBeenCalledTimes(1)
    })
})
