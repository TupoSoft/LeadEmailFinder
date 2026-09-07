import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
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
import { CreditPackCatalog } from '../../application/credit-pack-catalog'
import { CreditPurchaseService } from '../../application/credit-purchase.service'
import { PaymentPurchaseStore } from '../../application/ports/payment-purchase-store'
import { PurchaseRecord } from '../../domain/purchase-record'
import { PaymentsProviderName } from '../../domain/payment-configuration'
import { PURCHASE_STATUSES } from '../../domain/purchase-status'
import { ConfiguredCheckoutRedirectPolicy } from '../../infrastructure/configured-checkout-redirect-policy'
import { BillingCreditPacksController } from './billing-credit-packs.controller'
import { CreditPurchaseController } from './credit-purchase.controller'

const organizationA = '10000000-0000-4000-8000-000000000001'
const organizationB = '10000000-0000-4000-8000-000000000002'
const purchaseId = '20000000-0000-4000-8000-000000000001'
const safeFields = ['id', 'packId', 'credits', 'amountMinor', 'currency', 'status', 'createdAt', 'updatedAt']

function purchase(organizationId: string, status: PurchaseRecord['status'] = 'pending'): PurchaseRecord {
    return {
        id: purchaseId,
        organizationId,
        packId: 'starter',
        credits: 100,
        amountMinor: 500,
        currency: 'USD',
        status,
        provider: 'stub',
        providerReference: `stub_${purchaseId}`,
        providerTotalMinor: 500,
        creditsGrantedAt: null,
        createdAt: new Date('2026-09-07T00:00:00Z'),
        updatedAt: new Date('2026-09-07T00:01:00Z'),
    }
}

describe('customer billing payments HTTP boundary', () => {
    let app: INestApplication
    let store: jest.Mocked<PaymentPurchaseStore>
    const createCheckout = jest.fn()
    const catalog = new CreditPackCatalog(
        JSON.stringify({
            large: { credits: 1000, amountMinor: 4000, currency: 'USD', providerPriceId: 'secret-price-large' },
            starter: { credits: 100, amountMinor: 500, currency: 'USD', providerPriceId: 'secret-price-starter' },
            basic: { credits: 100, amountMinor: 700, currency: 'JPY', providerPriceId: 'secret-price-basic' },
        }),
    )

    beforeAll(async () => {
        store = {
            create: jest.fn(),
            bindProviderReference: jest.fn(),
            markFailed: jest.fn(),
            listForOrganization: jest.fn(),
            recordPaid: jest.fn(),
            recordCreditsGranted: jest.fn(),
            recordFailed: jest.fn(),
        }
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
            controllers: [BillingCreditPacksController, CreditPurchaseController],
            providers: [
                Reflector,
                RolePermissionPolicy,
                PermissionsGuard,
                { provide: CreditPackCatalog, useValue: catalog },
                {
                    provide: CreditPurchaseService,
                    useValue: new CreditPurchaseService(
                        store,
                        catalog,
                        { createCheckout, parseEvent: jest.fn() },
                        PaymentsProviderName.STUB,
                        'http://localhost:53000/billing/complete',
                        new ConfiguredCheckoutRedirectPolicy(['http://localhost:53000']),
                    ),
                },
                {
                    provide: AuthenticationService,
                    useValue: new AuthenticationService(new CredentialExtractor(), [authenticator]),
                },
                { provide: APP_GUARD, useClass: AuthGuard },
            ],
        }).compile()
        app = moduleRef.createNestApplication()
        app.useGlobalPipes(new ValidationPipe())
        app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector), { strategy: 'excludeAll' }))
        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })
    beforeEach(() => {
        jest.resetAllMocks()
        store.create.mockImplementation(input => Promise.resolve(purchase(input.organizationId)))
        store.bindProviderReference.mockResolvedValue(purchase(organizationA))
        store.listForOrganization.mockImplementation(organizationId => Promise.resolve([purchase(organizationId)]))
        createCheckout.mockResolvedValue({
            providerReference: `stub_${purchaseId}`,
            redirectUrl: `http://localhost:53000/billing/complete?purchaseId=${purchaseId}`,
        })
    })

    function get(path: string, token = 'owner-a'): request.Test {
        return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
    }
    function post(token = 'owner-a'): request.Test {
        return request(app.getHttpServer()).post('/v1/credit-purchases').set('Authorization', `Bearer ${token}`)
    }

    it.each(['owner-a', 'reader'])('returns only ordered customer pack values for %s', async token => {
        const response = await get('/v1/billing/credit-packs', token).expect(200)
        expect(response.body).toEqual([
            { id: 'basic', credits: 100, amountMinor: 700, currency: 'JPY' },
            { id: 'starter', credits: 100, amountMinor: 500, currency: 'USD' },
            { id: 'large', credits: 1000, amountMinor: 4000, currency: 'USD' },
        ])
    })

    it.each(['/v1/billing/credit-packs', '/v1/credit-purchases'])('guards the %s read', async path => {
        await request(app.getHttpServer()).get(path).expect(401)
        await get(path, 'invalid').expect(401)
        await get(path, 'member').expect(403)
        expect(store.listForOrganization).not.toHaveBeenCalled()
    })

    it.each([
        ['owner-a', organizationA],
        ['owner-b', organizationB],
        ['reader', organizationA],
    ])('scopes history for %s exclusively to the authenticated organization', async (token, organizationId) => {
        const response = await get(`/v1/credit-purchases?organizationId=${organizationB}`, token).expect(200)
        expect(store.listForOrganization).toHaveBeenCalledWith(organizationId)
        expect(Object.keys((response.body as Record<string, unknown>[])[0])).toEqual(safeFields)
    })

    it.each(PURCHASE_STATUSES)(
        'returns the authoritative %s status without provider correlation data',
        async status => {
            store.listForOrganization.mockResolvedValue([purchase(organizationA, status)])
            const response = await get('/v1/credit-purchases').expect(200)
            expect((response.body as { status: string }[])[0].status).toBe(status)
            expect(Object.keys((response.body as Record<string, unknown>[])[0])).toEqual(safeFields)
            expect(response.text).not.toMatch(/provider|organizationId|creditsGrantedAt|stub_|secret-price/)
        },
    )

    it('returns an empty history as an array', async () => {
        store.listForOrganization.mockResolvedValue([])
        await get('/v1/credit-purchases').expect(200, [])
    })

    it('uses only the pack identifier and principal organization for checkout', async () => {
        await post()
            .send({ packId: 'starter', organizationId: organizationB, credits: 9999, amountMinor: 1 })
            .expect(201, {
                id: purchaseId,
                status: 'pending',
                redirectUrl: `http://localhost:53000/billing/complete?purchaseId=${purchaseId}`,
            })
        expect(store.create).toHaveBeenCalledWith({
            organizationId: organizationA,
            packId: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            provider: 'stub',
        })
        expect(createCheckout).toHaveBeenCalledTimes(1)
    })

    it.each(['reader', 'member'])('forbids checkout for %s without creating a purchase', async token => {
        await post(token).send({ packId: 'starter' }).expect(403)
        expect(store.create).not.toHaveBeenCalled()
    })

    it.each([{}, { packId: '' }, { packId: 1 }, { packId: 'missing' }])('rejects invalid pack input %j', async body => {
        await post().send(body).expect(400)
        expect(store.create).not.toHaveBeenCalled()
        expect(createCheckout).not.toHaveBeenCalled()
    })

    it('records an unsafe provider redirect as failed and returns a safe 502 response', async () => {
        createCheckout.mockResolvedValue({
            providerReference: 'internal-reference',
            redirectUrl: 'https://attacker.test/secret',
        })
        const response = await post().send({ packId: 'starter' }).expect(502)
        expect((response.body as { message: string }).message).toBe('Payment provider could not create a checkout')
        expect(response.text).not.toMatch(/attacker|secret|internal-reference/)
        expect(store.markFailed).toHaveBeenCalledWith(purchaseId)
        expect(store.bindProviderReference).not.toHaveBeenCalled()
    })

    it('publishes safe catalog and history schemas with explicit status vocabulary', () => {
        const document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
        const schemas = document.components!.schemas! as Record<
            string,
            { properties: Record<string, { enum?: string[] }> }
        >
        expect(Object.keys(schemas.BillingCreditPackResponseDto.properties)).toEqual([
            'id',
            'credits',
            'amountMinor',
            'currency',
        ])
        expect(Object.keys(schemas.CreditPurchaseResponseDto.properties)).toEqual(safeFields)
        expect(schemas.CreditPurchaseResponseDto.properties.status.enum).toEqual(PURCHASE_STATUSES)
        expect(JSON.stringify(document)).not.toMatch(
            /providerPriceId|providerReference|providerTotalMinor|creditsGrantedAt/,
        )
        expect(document.paths['/v1/billing/credit-packs'].get?.parameters).toEqual([])
        for (const path of ['/v1/billing/credit-packs', '/v1/credit-purchases']) {
            expect(document.paths[path].get?.security).toEqual([{ lef_session: [] }, { oidc: [] }])
        }
        const checkout = document.paths['/v1/credit-purchases'].post!
        expect(checkout.security).toEqual([{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
        expect(checkout.parameters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Origin', in: 'header', required: false }),
                expect.objectContaining({ name: 'Referer', in: 'header', required: false }),
            ]),
        )
        expect(checkout.parameters).not.toContainEqual(expect.objectContaining({ name: 'x-csrf-token' }))
    })
})
