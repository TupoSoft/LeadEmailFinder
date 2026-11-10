import { DataSource, EntityManager } from 'typeorm'
import {
    PaidPurchaseCorrelation,
    PurchaseCurrencyMismatchError,
    PurchaseProviderTotalConflictError,
    PurchaseReferenceConflictError,
} from '../../application/ports/payment-purchase-store'
import { CreditPurchase, CreditPurchaseStatus } from './typeorm/credit-purchase.entity'
import { TypeOrmPaymentPurchaseStore } from './typeorm-payment-purchase.store'

function purchaseWith(status: CreditPurchaseStatus, providerReference: string | null = 'provider-purchase-1'): CreditPurchase {
    return {
        id: '20000000-0000-4000-8000-000000000001',
        organizationId: '10000000-0000-4000-8000-000000000001',
        credits: 100,
        currency: 'USD',
        providerReference,
        providerTotalMinor: null,
        status,
    } as CreditPurchase
}

function paidInput(overrides: Partial<PaidPurchaseCorrelation> = {}): PaidPurchaseCorrelation {
    return {
        providerReference: 'provider-purchase-1',
        providerTotalMinor: 500,
        currency: 'USD',
        ...overrides,
    }
}

describe('TypeOrmPaymentPurchaseStore', () => {
    let manager: jest.Mocked<Pick<EntityManager, 'findOne' | 'save' | 'create' | 'find' | 'findOneByOrFail'>>
    let store: TypeOrmPaymentPurchaseStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            find: jest.fn(),
            findOneByOrFail: jest.fn(),
        }
        manager.create.mockImplementation((_entity, data) => data as never)
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmPaymentPurchaseStore({
            transaction,
            manager: manager as unknown as EntityManager,
        } as unknown as DataSource)
    })

    describe('create', () => {
        it('creates a pending purchase and maps it to a record', async () => {
            manager.save.mockResolvedValue({
                id: 'purchase-1',
                organizationId: 'org-1',
                packId: 'starter',
                credits: 100,
                amountMinor: 500,
                currency: 'USD',
                provider: 'stub',
                providerReference: null,
                providerTotalMinor: null,
                status: CreditPurchaseStatus.PENDING,
                creditsGrantedAt: null,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-01T00:00:00Z'),
            })

            const result = await store.create({
                organizationId: 'org-1',
                packId: 'starter',
                credits: 100,
                amountMinor: 500,
                currency: 'USD',
                provider: 'stub',
            })

            expect(manager.create).toHaveBeenCalledWith(CreditPurchase, {
                organizationId: 'org-1',
                packId: 'starter',
                credits: 100,
                amountMinor: 500,
                currency: 'USD',
                provider: 'stub',
                status: CreditPurchaseStatus.PENDING,
            })
            expect(result).toEqual(
                expect.objectContaining({ id: 'purchase-1', status: 'pending', providerReference: null }),
            )
        })
    })

    describe('bindProviderReference', () => {
        it('saves the provider reference on the purchase', async () => {
            const purchase = purchaseWith(CreditPurchaseStatus.PENDING, null)
            manager.findOneByOrFail.mockResolvedValue(purchase)
            manager.save.mockImplementation((_entity, data) => Promise.resolve(data as CreditPurchase))

            const result = await store.bindProviderReference(purchase.id, 'stub_purchase-1')

            expect(manager.save).toHaveBeenCalledWith(
                CreditPurchase,
                expect.objectContaining({ providerReference: 'stub_purchase-1' }),
            )
            expect(result.providerReference).toBe('stub_purchase-1')
        })
    })

    describe('markFailed', () => {
        it('marks the purchase failed', async () => {
            const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
            manager.findOneByOrFail.mockResolvedValue(purchase)

            await store.markFailed(purchase.id)

            expect(manager.save).toHaveBeenCalledWith(
                CreditPurchase,
                expect.objectContaining({ status: CreditPurchaseStatus.FAILED }),
            )
        })
    })

    describe('listForOrganization', () => {
        it('lists purchases newest first, mapped to records', async () => {
            const purchase = purchaseWith(CreditPurchaseStatus.PAID)
            manager.find.mockResolvedValue([purchase])

            const result = await store.listForOrganization(purchase.organizationId)

            expect(manager.find).toHaveBeenCalledWith(CreditPurchase, {
                where: { organizationId: purchase.organizationId },
                order: { createdAt: 'DESC' },
            })
            expect(result).toEqual([expect.objectContaining({ id: purchase.id })])
        })
    })

    it('locks and marks a purchase paid', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(paidInput({ providerReference: purchase.providerReference! }))).resolves.toEqual({
            id: purchase.id,
            organizationId: purchase.organizationId,
            credits: purchase.credits,
        })
        expect(manager.findOne).toHaveBeenCalledWith(CreditPurchase, {
            where: { providerReference: purchase.providerReference },
            lock: { mode: 'pessimistic_write' },
        })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({ status: CreditPurchaseStatus.PAID, providerTotalMinor: 500 }),
        )
    })

    it('returns an already paid purchase without rewriting it', async () => {
        const purchase = Object.assign(purchaseWith(CreditPurchaseStatus.PAID), { providerTotalMinor: 500 })
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(paidInput({ providerReference: purchase.providerReference! }))).resolves.toMatchObject({
            id: purchase.id,
        })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('returns null for an unknown paid reference with no purchase id fallback', async () => {
        manager.findOne.mockResolvedValue(null)

        await expect(store.recordPaid(paidInput({ providerReference: 'unknown' }))).resolves.toBeNull()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('falls back to the purchase id and binds the reference when it arrives before checkout saves it', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING, null)
        manager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(purchase)

        await expect(
            store.recordPaid(paidInput({ providerReference: 'provider-purchase-1', purchaseId: purchase.id })),
        ).resolves.toEqual({
            id: purchase.id,
            organizationId: purchase.organizationId,
            credits: purchase.credits,
        })
        expect(manager.findOne).toHaveBeenNthCalledWith(1, CreditPurchase, {
            where: { providerReference: 'provider-purchase-1' },
            lock: { mode: 'pessimistic_write' },
        })
        expect(manager.findOne).toHaveBeenNthCalledWith(2, CreditPurchase, {
            where: { id: purchase.id },
            lock: { mode: 'pessimistic_write' },
        })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({
                providerReference: 'provider-purchase-1',
                providerTotalMinor: 500,
                status: CreditPurchaseStatus.PAID,
            }),
        )
    })

    it('returns null for an unknown purchase id fallback', async () => {
        manager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)

        await expect(
            store.recordPaid(paidInput({ providerReference: 'provider-purchase-1', purchaseId: 'unknown-purchase' })),
        ).resolves.toBeNull()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('treats a purchase id already bound to the same reference as already resolved, not a conflict', async () => {
        const purchase = Object.assign(purchaseWith(CreditPurchaseStatus.PAID, 'provider-purchase-1'), {
            providerTotalMinor: 500,
        })
        manager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(purchase)

        await expect(
            store.recordPaid(paidInput({ providerReference: 'provider-purchase-1', purchaseId: purchase.id })),
        ).resolves.toEqual({
            id: purchase.id,
            organizationId: purchase.organizationId,
            credits: purchase.credits,
        })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects rebinding a purchase id already bound to a different provider reference', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING, 'established-reference')
        manager.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(purchase)

        const promise = store.recordPaid(
            paidInput({ providerReference: 'different-reference', purchaseId: purchase.id }),
        )

        await expect(promise).rejects.toBeInstanceOf(PurchaseReferenceConflictError)
        await expect(promise).rejects.toMatchObject({
            purchaseId: purchase.id,
            existingProviderReference: 'established-reference',
        })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('backfills a missing provider total on a paid replay', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PAID)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(paidInput())).resolves.toMatchObject({ id: purchase.id })

        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({ providerTotalMinor: 500 }),
        )
    })

    it('rejects a paid replay with a different provider total', async () => {
        const purchase = Object.assign(purchaseWith(CreditPurchaseStatus.PAID), { providerTotalMinor: 500 })
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(paidInput({ providerTotalMinor: 615 }))).rejects.toBeInstanceOf(
            PurchaseProviderTotalConflictError,
        )
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects a paid event whose provider currency differs from the purchase', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(paidInput({ currency: 'EUR' }))).rejects.toBeInstanceOf(
            PurchaseCurrencyMismatchError,
        )
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('marks only a pending purchase failed', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordFailed({ providerReference: purchase.providerReference! })).resolves.toBe(true)
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({ status: CreditPurchaseStatus.FAILED }),
        )
    })

    it('does not regress a paid purchase when failure arrives later', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PAID)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordFailed({ providerReference: purchase.providerReference! })).resolves.toBe(true)
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('marks the paid purchase credit grant complete under a write lock', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PAID)
        manager.findOne.mockResolvedValue(purchase)

        await store.recordCreditsGranted(purchase.id)

        expect(manager.findOne).toHaveBeenCalledWith(CreditPurchase, {
            where: { id: purchase.id },
            lock: { mode: 'pessimistic_write' },
        })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({ creditsGrantedAt: expect.any(Date) }),
        )
    })

    it('does not rewrite an already completed purchase credit grant', async () => {
        const purchase = Object.assign(purchaseWith(CreditPurchaseStatus.PAID), { creditsGrantedAt: new Date() })
        manager.findOne.mockResolvedValue(purchase)

        await store.recordCreditsGranted(purchase.id)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects a credit-grant completion marker on an unpaid purchase', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordCreditsGranted(purchase.id)).rejects.toThrow('unpaid purchase')

        expect(manager.save).not.toHaveBeenCalled()
    })
})
