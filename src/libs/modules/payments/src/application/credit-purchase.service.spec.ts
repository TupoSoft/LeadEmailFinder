import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { CreditPack, CreditPackNotFoundError } from '../domain/credit-pack'
import { PurchaseRecord } from '../domain/purchase-record'
import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPurchaseService, PaymentCheckoutError } from './credit-purchase.service'
import { CheckoutRedirectPolicy } from './ports/checkout-redirect-policy'
import { PaymentProvider } from './ports/payment-provider'
import { PaymentPurchaseStore } from './ports/payment-purchase-store'

const principal: AuthPrincipal = {
    credentialKind: 'human_session',
    issuer: 'https://issuer.example.test',
    subject: 'owner-1',
    organizationId: '10000000-0000-4000-8000-000000000001',
    membershipRole: 'owner',
    permissions: [],
    credentialId: 'identity-1',
}

const pack: CreditPack = {
    id: 'starter',
    credits: 100,
    amountMinor: 500,
    currency: 'USD',
    providerPriceId: 'price_starter',
}

function purchaseFixture(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
    return {
        id: '20000000-0000-4000-8000-000000000001',
        organizationId: principal.organizationId,
        packId: 'starter',
        credits: 100,
        amountMinor: 500,
        currency: 'USD',
        provider: 'stub',
        providerReference: null,
        providerTotalMinor: null,
        status: 'pending',
        creditsGrantedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('CreditPurchaseService', () => {
    let store: jest.Mocked<PaymentPurchaseStore>
    let catalog: jest.Mocked<Pick<CreditPackCatalog, 'get'>>
    let paymentProvider: jest.Mocked<Pick<PaymentProvider, 'createCheckout' | 'parseEvent'>>
    let redirectPolicy: jest.Mocked<CheckoutRedirectPolicy>
    let service: CreditPurchaseService

    beforeEach(() => {
        store = {
            create: jest.fn(),
            bindProviderReference: jest.fn(),
            markFailed: jest.fn(),
            listForOrganization: jest.fn(),
            recordPaid: jest.fn(),
            recordCreditsGranted: jest.fn(),
            recordFailed: jest.fn(),
        }
        catalog = { get: jest.fn() }
        paymentProvider = { createCheckout: jest.fn(), parseEvent: jest.fn() }
        redirectPolicy = { assertAllowed: jest.fn(url => url) }

        service = new CreditPurchaseService(
            store,
            catalog as unknown as CreditPackCatalog,
            paymentProvider,
            'stub' as never,
            'http://localhost:3000/payment-return',
            redirectPolicy,
        )
    })

    it('persists catalog values before creating checkout and then stores the provider reference', async () => {
        const purchase = purchaseFixture()
        const bound = purchaseFixture({ providerReference: 'stub_purchase-1' })
        catalog.get.mockReturnValue(pack)
        store.create.mockResolvedValue(purchase)
        store.bindProviderReference.mockResolvedValue(bound)
        paymentProvider.createCheckout.mockResolvedValue({
            providerReference: 'stub_purchase-1',
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })

        const result = await service.start(principal, 'starter')

        expect(catalog.get).toHaveBeenCalledWith('starter')
        expect(store.create).toHaveBeenCalledWith({
            organizationId: principal.organizationId,
            packId: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            provider: 'stub',
        })
        expect(paymentProvider.createCheckout).toHaveBeenCalledWith({
            purchaseId: purchase.id,
            organizationId: principal.organizationId,
            pack,
            returnUrl: 'http://localhost:3000/payment-return',
        })
        expect(store.bindProviderReference).toHaveBeenCalledWith(purchase.id, 'stub_purchase-1')
        expect(result).toEqual({
            purchase: bound,
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })
    })

    it('creates no purchase when the pack does not exist', async () => {
        catalog.get.mockImplementation(() => {
            throw new CreditPackNotFoundError('missing')
        })

        await expect(service.start(principal, 'missing')).rejects.toThrow(CreditPackNotFoundError)
        expect(store.create).not.toHaveBeenCalled()
        expect(paymentProvider.createCheckout).not.toHaveBeenCalled()
    })

    it('marks the purchase failed when checkout creation fails', async () => {
        const purchase = purchaseFixture({ id: '20000000-0000-4000-8000-000000000002' })
        catalog.get.mockReturnValue(pack)
        store.create.mockResolvedValue(purchase)
        paymentProvider.createCheckout.mockRejectedValue(new Error('provider unavailable'))

        await expect(service.start(principal, 'starter')).rejects.toThrow(PaymentCheckoutError)
        expect(store.markFailed).toHaveBeenCalledWith(purchase.id)
        expect(store.bindProviderReference).not.toHaveBeenCalled()
    })

    it('fails a purchase whose provider URL violates the redirect policy before binding correlation', async () => {
        const purchase = purchaseFixture()
        catalog.get.mockReturnValue(pack)
        store.create.mockResolvedValue(purchase)
        paymentProvider.createCheckout.mockResolvedValue({
            providerReference: 'private',
            redirectUrl: 'https://rejected.test',
        })
        redirectPolicy.assertAllowed.mockImplementation(() => {
            throw new Error('Checkout destination is unavailable')
        })

        await expect(service.start(principal, 'starter')).rejects.toThrow(PaymentCheckoutError)
        expect(redirectPolicy.assertAllowed).toHaveBeenCalledWith('https://rejected.test')
        expect(store.markFailed).toHaveBeenCalledWith(purchase.id)
        expect(store.bindProviderReference).not.toHaveBeenCalled()
        expect(paymentProvider.createCheckout).toHaveBeenCalledTimes(1)
    })

    it('returns the normalized URL supplied by the policy', async () => {
        catalog.get.mockReturnValue(pack)
        store.create.mockResolvedValue(purchaseFixture())
        store.bindProviderReference.mockResolvedValue(purchaseFixture())
        paymentProvider.createCheckout.mockResolvedValue({
            providerReference: 'private',
            redirectUrl: 'HTTPS://CHECKOUT.TEST:443/pay',
        })
        redirectPolicy.assertAllowed.mockReturnValue('https://checkout.test/pay')

        const result = await service.start(principal, 'starter')
        expect(result.redirectUrl).toBe('https://checkout.test/pay')
    })

    it('lists only the requested organization', async () => {
        const purchases = [purchaseFixture({ id: 'purchase-2' }), purchaseFixture({ id: 'purchase-1' })]
        store.listForOrganization.mockResolvedValue(purchases)

        await expect(service.listForOrganization(principal.organizationId)).resolves.toBe(purchases)
        expect(store.listForOrganization).toHaveBeenCalledWith(principal.organizationId)
    })
})
