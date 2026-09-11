import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
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
import { CreditsController } from './credits.controller'

describe('platform credits HTTP boundary', () => {
    let app: INestApplication
    let store: jest.Mocked<CreditLedgerStore>
    const organizationId = '5b92ded1-7eba-4c66-b72e-a5fea465da68'
    const key = '841668a4-3ba2-4a6d-92a9-969bd60c5121'
    const route = `/credits/${organizationId}`

    beforeAll(async () => {
        store = {
            debit: jest.fn(),
            debitUpTo: jest.fn(),
            credit: jest.fn(),
            creditOnce: jest.fn(),
            getBalance: jest.fn(),
            getBalanceSnapshot: jest.fn(),
            setBalance: jest.fn(),
        }
        const authenticator: CredentialAuthenticator = {
            supports: credential => credential.scheme === 'bearer',
            authenticate: credential => {
                if (credential.token !== 'platform-test-token' && credential.token !== 'customer-test-token') {
                    return Promise.reject(new CredentialRejectedError('Invalid test credential'))
                }
                return Promise.resolve({
                    credentialKind: 'service_client',
                    issuer: 'https://issuer.test',
                    subject: 'test-service',
                    organizationId,
                    membershipRole: 'member',
                    permissions: credential.token === 'platform-test-token' ? ['platform:admin'] : ['verification:run'],
                    credentialId: 'test-credential',
                })
            },
        }
        const moduleRef = await Test.createTestingModule({
            controllers: [CreditsController],
            providers: [
                Reflector,
                RolePermissionPolicy,
                PermissionsGuard,
                { provide: CreditsService, useValue: new CreditsService(store) },
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [authenticator]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
            ],
        }).compile()
        app = moduleRef.createNestApplication()
        app.useGlobalPipes(new ValidationPipe())
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
        jest.resetAllMocks()
    })

    function addCredits(): request.Test {
        return request(app.getHttpServer()).post(route).set('Authorization', 'Bearer platform-test-token')
    }

    function expectNoLedgerAccess(): void {
        for (const method of Object.values(store)) {
            expect(method).not.toHaveBeenCalled()
        }
    }

    it('returns 201 for insertion and equivalent replay with the current balance', async () => {
        store.credit
            .mockResolvedValueOnce({ disposition: 'inserted', recordedAmount: 5, balance: 5 })
            .mockResolvedValueOnce({ disposition: 'existing', recordedAmount: 5, balance: 12 })

        await addCredits().set('Idempotency-Key', key).send({ amount: 5 }).expect(201, { balance: 5 })
        await addCredits().set('Idempotency-Key', key).send({ amount: 5 }).expect(201, { balance: 12 })

        expect(store.credit.mock.calls).toEqual([
            [organizationId, 5, `platform-credit-add:${key}`],
            [organizationId, 5, `platform-credit-add:${key}`],
        ])
    })

    it('returns 409 for a different-amount replay without exposing the key', async () => {
        store.credit.mockResolvedValue({ disposition: 'existing', recordedAmount: 5, balance: 12 })

        const response = await addCredits().set('Idempotency-Key', key).send({ amount: 9 }).expect(409)

        expect(response.body).toEqual({
            statusCode: 409,
            error: 'Conflict',
            message: 'Idempotency-Key has already been used for a different credit amount',
        })
        expect(store.credit).toHaveBeenCalledTimes(1)
        expect(store.setBalance).not.toHaveBeenCalled()
    })

    it('rejects a missing key before accessing the ledger', async () => {
        await addCredits().send({ amount: 5 }).expect(400)

        expectNoLedgerAccess()
    })

    it.each([
        ['malformed', 'not-a-uuid'],
        ['uppercase', key.toUpperCase()],
        ['prefixed', `platform-credit-add:${key}`],
        ['combined', `${key}, ${key}`],
        ['repeated', [key, key]],
        ['different repeated', [key, 'b4c4f24e-0c46-49e8-9577-b4a9de5c3280']],
    ])('rejects a %s key before accessing the ledger', async (_name, header) => {
        const response = await addCredits().set({ 'Idempotency-Key': header }).send({ amount: 5 }).expect(400)

        expect(JSON.stringify(response.body)).not.toContain(key)
        expectNoLedgerAccess()
    })

    it.each([{}, { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: '5' }])(
        'rejects invalid body %j before accessing the ledger',
        async body => {
            await addCredits().set('Idempotency-Key', key).send(body).expect(400)

            expectNoLedgerAccess()
        },
    )

    it('rejects an invalid organization UUID before accessing the ledger', async () => {
        await request(app.getHttpServer())
            .post('/credits/not-a-uuid')
            .set('Authorization', 'Bearer platform-test-token')
            .set('Idempotency-Key', key)
            .send({ amount: 5 })
            .expect(400)

        expectNoLedgerAccess()
    })

    it('rejects missing authentication before accessing the ledger', async () => {
        await request(app.getHttpServer()).post(route).set('Idempotency-Key', key).send({ amount: 5 }).expect(401)

        expectNoLedgerAccess()
    })

    it('rejects invalid authentication before accessing the ledger', async () => {
        await request(app.getHttpServer())
            .post(route)
            .set('Authorization', 'Bearer invalid-test-token')
            .set('Idempotency-Key', key)
            .send({ amount: 5 })
            .expect(401)

        expectNoLedgerAccess()
    })

    it('rejects an authenticated customer before accessing the ledger', async () => {
        await request(app.getHttpServer())
            .post(route)
            .set('Authorization', 'Bearer customer-test-token')
            .set('Idempotency-Key', key)
            .send({ amount: 5 })
            .expect(403)

        expectNoLedgerAccess()
    })

    it.each(['get', 'put'] as const)(
        'protects credit %s with authentication, platform permission, and UUID validation',
        async method => {
            await request(app.getHttpServer())[method](route).send({ amount: 0 }).expect(401)
            const forbidden = request(app.getHttpServer())[method](route)
            await forbidden.set('Authorization', 'Bearer customer-test-token').send({ amount: 0 }).expect(403)
            const invalidId = request(app.getHttpServer())[method]('/credits/not-a-uuid')
            await invalidId.set('Authorization', 'Bearer platform-test-token').send({ amount: 0 }).expect(400)
            expectNoLedgerAccess()
        },
    )

    it.each([{}, { amount: -1 }, { amount: 1.5 }, { amount: '5' }])(
        'rejects invalid absolute set body %j',
        async body => {
            await request(app.getHttpServer())
                .put(route)
                .set('Authorization', 'Bearer platform-test-token')
                .send(body)
                .expect(400)
            expectNoLedgerAccess()
        },
    )

    it('accepts zero as an absolute balance without an idempotency key', async () => {
        store.setBalance.mockResolvedValue({ kind: 'applied', balance: 0 })
        await request(app.getHttpServer())
            .put(route)
            .set('Authorization', 'Bearer platform-test-token')
            .send({ amount: 0 })
            .expect(200, { balance: 0 })
        expect(store.setBalance).toHaveBeenCalledWith(organizationId, 0)
    })

    it('returns 409 without exposing reservation details when the target is below reserved credits', async () => {
        store.setBalance.mockResolvedValue({ kind: 'below-reserved' })
        const response = await request(app.getHttpServer())
            .put(route)
            .set('Authorization', 'Bearer platform-test-token')
            .send({ amount: 2 })
            .expect(409)
        expect(JSON.stringify(response.body)).not.toMatch(/reservation|operation/i)
    })

    it('keeps absolute set and balance lookup independent of an idempotency key', async () => {
        store.setBalance.mockResolvedValue({ kind: 'applied', balance: 7 })
        store.getBalance.mockResolvedValue(7)

        await request(app.getHttpServer())
            .put(route)
            .set('Authorization', 'Bearer platform-test-token')
            .send({ amount: 7 })
            .expect(200, { balance: 7 })
        await request(app.getHttpServer())
            .get(route)
            .set('Authorization', 'Bearer platform-test-token')
            .expect(200, { balance: 7 })

        expect(store.setBalance).toHaveBeenCalledWith(organizationId, 7)
        expect(store.credit).not.toHaveBeenCalled()
    })
})
