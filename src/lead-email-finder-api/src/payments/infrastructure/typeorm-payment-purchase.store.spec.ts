import { DataSource, EntityManager } from 'typeorm'
import { CreditPurchase, CreditPurchaseStatus } from '../credit-purchase.entity'
import { TypeOrmPaymentPurchaseStore } from './typeorm-payment-purchase.store'

function purchaseWith(status: CreditPurchaseStatus): CreditPurchase {
    return {
        id: '20000000-0000-4000-8000-000000000001',
        organizationId: '10000000-0000-4000-8000-000000000001',
        credits: 100,
        providerReference: 'provider-purchase-1',
        status,
    } as CreditPurchase
}

describe('TypeOrmPaymentPurchaseStore', () => {
    let manager: jest.Mocked<Pick<EntityManager, 'findOne' | 'save'>>
    let store: TypeOrmPaymentPurchaseStore

    beforeEach(() => {
        manager = { findOne: jest.fn(), save: jest.fn() }
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmPaymentPurchaseStore({ transaction } as unknown as DataSource)
    })

    it('locks and marks a purchase paid', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(purchase.providerReference!)).resolves.toEqual({
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
            expect.objectContaining({ status: CreditPurchaseStatus.PAID }),
        )
    })

    it('returns an already paid purchase without rewriting it', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PAID)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordPaid(purchase.providerReference!)).resolves.toMatchObject({ id: purchase.id })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('returns null for an unknown paid reference', async () => {
        manager.findOne.mockResolvedValue(null)

        await expect(store.recordPaid('unknown')).resolves.toBeNull()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('marks only a pending purchase failed', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PENDING)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordFailed(purchase.providerReference!)).resolves.toBe(true)
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchase,
            expect.objectContaining({ status: CreditPurchaseStatus.FAILED }),
        )
    })

    it('does not regress a paid purchase when failure arrives later', async () => {
        const purchase = purchaseWith(CreditPurchaseStatus.PAID)
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.recordFailed(purchase.providerReference!)).resolves.toBe(true)
        expect(manager.save).not.toHaveBeenCalled()
    })
})
