import { ClassSerializerInterceptor, INestApplication } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import request from 'supertest'
import {
    AuthenticationService,
    AuthGuard,
    CredentialAuthenticator,
    CredentialExtractor,
    CredentialRejectedError,
    PermissionsGuard,
    RolePermissionPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { CreditLedgerStore } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '../application/credits.service'
import { BillingSummaryController } from './billing-summary.controller'

describe('current organization billing summary HTTP boundary', () => {
    let app: INestApplication
    const getBalance = jest.fn()
    const organizationA = '10000000-0000-4000-8000-000000000001'
    const organizationB = '10000000-0000-4000-8000-000000000002'

    beforeAll(async () => {
        const authenticator: CredentialAuthenticator = {
            supports: credential => credential.scheme === 'bearer',
            authenticate: credential => {
                if (!['owner-a', 'owner-b', 'member', 'reader'].includes(credential.token)) {
                    return Promise.reject(new CredentialRejectedError('Invalid test credential'))
                }
                return Promise.resolve({
                    credentialKind: credential.token === 'reader' ? 'service_client' : 'human_session',
                    issuer: 'https://issuer.test',
                    subject: 'customer',
                    credentialId: 'credential',
                    organizationId: credential.token === 'owner-b' ? organizationB : organizationA,
                    membershipRole: credential.token.startsWith('owner') ? 'owner' : 'member',
                    permissions: credential.token === 'reader' ? ['billing:read'] : [],
                })
            },
        }
        const moduleRef = await Test.createTestingModule({
            controllers: [BillingSummaryController],
            providers: [
                Reflector,
                RolePermissionPolicy,
                PermissionsGuard,
                {
                    provide: CreditsService,
                    useValue: new CreditsService({ getBalance } as unknown as CreditLedgerStore),
                },
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [authenticator]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
            ],
        }).compile()
        app = moduleRef.createNestApplication()
        app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector), { strategy: 'excludeAll' }))
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })
    beforeEach(() => {
        getBalance
            .mockReset()
            .mockImplementation(organizationId => Promise.resolve(organizationId === organizationA ? 125 : 45))
    })

    it.each([
        ['owner-a', organizationA, 125],
        ['owner-b', organizationB, 45],
        ['reader', organizationA, 125],
    ])(
        'reads the authenticated organization for %s and ignores tenant input',
        async (token, organizationId, balance) => {
            await request(app.getHttpServer())
                .get(`/v1/billing/summary?organizationId=${organizationB}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200, { balance })
            expect(getBalance).toHaveBeenCalledWith(organizationId)
            expect(getBalance).toHaveBeenCalledTimes(1)
        },
    )

    it.each([
        ['', 401],
        ['invalid', 401],
        ['member', 403],
    ])('rejects %s before reading credits', async (token, status) => {
        const call = request(app.getHttpServer()).get('/v1/billing/summary')
        if (token) call.set('Authorization', `Bearer ${token}`)
        await call.expect(status)
        expect(getBalance).not.toHaveBeenCalled()
    })

    it('documents a safe balance response without an organization request parameter', () => {
        const document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
        expect(document.paths['/v1/billing/summary'].get?.parameters).toEqual([])
        expect(document.paths['/v1/billing/summary'].get?.security).toEqual([{ lef_session: [] }, { oidc: [] }])
        expect(
            Object.keys((document.components?.schemas?.CreditResponseDto as { properties: object }).properties),
        ).toEqual(['balance'])
        expect(Object.keys(document.paths['/v1/billing/summary'].get!.responses)).toEqual(['200', '401', '403'])
    })
})
