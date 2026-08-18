import { ConfigService } from '@nestjs/config'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Repository } from 'typeorm'
import { EnvironmentVariablesDto } from '../environment-variables.dto'
import { CreditPack, CreditPackCatalog, CreditPackNotFoundError } from './credit-pack-catalog'
import { CreditPurchase, CreditPurchaseStatus } from './credit-purchase.entity'
import { CreditPurchaseService, PaymentCheckoutError } from './credit-purchase.service'
import { PaymentProvider } from './payment-provider'

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

describe('CreditPurchaseService', () => {
    let purchaseRepo: jest.Mocked<Pick<Repository<CreditPurchase>, 'create' | 'save' | 'find'>>
    let catalog: jest.Mocked<Pick<CreditPackCatalog, 'get'>>
    let paymentProvider: jest.Mocked<Pick<PaymentProvider, 'createCheckout' | 'parseEvent'>>
    let service: CreditPurchaseService

    beforeEach(() => {
        purchaseRepo = {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
        }
        catalog = { get: jest.fn() }
        paymentProvider = { createCheckout: jest.fn(), parseEvent: jest.fn() }
        const configService = {
            getOrThrow: jest.fn((key: string) => {
                if (key === 'PAYMENTS_PROVIDER') return 'stub'
                if (key === 'PAYMENTS_CHECKOUT_RETURN_URL') return 'http://localhost:3000/payment-return'
                throw new Error(`Unexpected configuration key: ${key}`)
            }),
        } as unknown as ConfigService<EnvironmentVariablesDto, true>

        service = new CreditPurchaseService(
            purchaseRepo as unknown as Repository<CreditPurchase>,
            catalog as unknown as CreditPackCatalog,
            paymentProvider,
            configService,
        )
    })

    it('persists catalog values before creating checkout and then stores the provider reference', async () => {
        const purchase = {
            id: '20000000-0000-4000-8000-000000000001',
            status: CreditPurchaseStatus.PENDING,
        } as CreditPurchase
        catalog.get.mockReturnValue(pack)
        purchaseRepo.create.mockReturnValue(purchase)
        purchaseRepo.save.mockResolvedValue(purchase)
        paymentProvider.createCheckout.mockResolvedValue({
            providerReference: 'stub_purchase-1',
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })

        const result = await service.start(principal, 'starter')

        expect(catalog.get).toHaveBeenCalledWith('starter')
        expect(purchaseRepo.create).toHaveBeenCalledWith({
            organizationId: principal.organizationId,
            packId: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            provider: 'stub',
            status: CreditPurchaseStatus.PENDING,
        })
        expect(paymentProvider.createCheckout).toHaveBeenCalledWith({
            purchaseId: purchase.id,
            organizationId: principal.organizationId,
            pack,
            returnUrl: 'http://localhost:3000/payment-return',
        })
        expect(purchaseRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ providerReference: 'stub_purchase-1' }),
        )
        expect(result).toEqual({
            purchase,
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })
    })

    it('creates no purchase when the pack does not exist', async () => {
        catalog.get.mockImplementation(() => {
            throw new CreditPackNotFoundError('missing')
        })

        await expect(service.start(principal, 'missing')).rejects.toThrow(CreditPackNotFoundError)
        expect(purchaseRepo.create).not.toHaveBeenCalled()
        expect(purchaseRepo.save).not.toHaveBeenCalled()
        expect(paymentProvider.createCheckout).not.toHaveBeenCalled()
    })

    it('marks the purchase failed when checkout creation fails', async () => {
        const purchase = {
            id: '20000000-0000-4000-8000-000000000002',
            status: CreditPurchaseStatus.PENDING,
        } as CreditPurchase
        catalog.get.mockReturnValue(pack)
        purchaseRepo.create.mockReturnValue(purchase)
        purchaseRepo.save.mockResolvedValue(purchase)
        paymentProvider.createCheckout.mockRejectedValue(new Error('provider unavailable'))

        await expect(service.start(principal, 'starter')).rejects.toThrow(PaymentCheckoutError)
        expect(purchaseRepo.save).toHaveBeenCalledTimes(2)
        expect(purchaseRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: CreditPurchaseStatus.FAILED }),
        )
    })

    it('lists only the requested organization newest first', async () => {
        const purchases = [{ id: 'purchase-2' }, { id: 'purchase-1' }] as CreditPurchase[]
        purchaseRepo.find.mockResolvedValue(purchases)

        await expect(service.listForOrganization(principal.organizationId)).resolves.toBe(purchases)
        expect(purchaseRepo.find).toHaveBeenCalledWith({
            where: { organizationId: principal.organizationId },
            order: { createdAt: 'DESC' },
        })
    })
})
