import { CreditsService } from '../credits/credits.service'
import { PaymentEventHandler } from './payment-event.handler'
import { PaidPurchase, PaymentPurchaseStore } from './payment-purchase.store'

const paidEvent = {
    kind: 'purchase_paid' as const,
    providerEventId: 'event-paid-1',
    providerReference: 'provider-purchase-1',
}

const purchase: PaidPurchase = {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    credits: 100,
}

describe('PaymentEventHandler', () => {
    let purchases: jest.Mocked<PaymentPurchaseStore>
    let credits: jest.Mocked<Pick<CreditsService, 'credit'>>
    let handler: PaymentEventHandler

    beforeEach(() => {
        purchases = { recordPaid: jest.fn(), recordFailed: jest.fn() }
        credits = { credit: jest.fn() }
        handler = new PaymentEventHandler(purchases, credits as unknown as CreditsService)
    })

    it('grants stored purchase credits using the purchase id', async () => {
        purchases.recordPaid.mockResolvedValue(purchase)

        await handler.handle(paidEvent)

        expect(purchases.recordPaid).toHaveBeenCalledWith(paidEvent.providerReference)
        expect(credits.credit).toHaveBeenCalledWith(purchase.organizationId, purchase.credits, purchase.id)
    })

    it('retries the idempotent grant when a paid event is replayed', async () => {
        purchases.recordPaid.mockResolvedValue(purchase)

        await handler.handle(paidEvent)
        await handler.handle(paidEvent)

        expect(credits.credit).toHaveBeenCalledTimes(2)
        expect(credits.credit).toHaveBeenNthCalledWith(2, purchase.organizationId, purchase.credits, purchase.id)
    })

    it('acknowledges an unknown provider reference without changing credits', async () => {
        purchases.recordPaid.mockResolvedValue(null)

        await handler.handle(paidEvent)

        expect(credits.credit).not.toHaveBeenCalled()
    })

    it('records a failed purchase without changing credits', async () => {
        purchases.recordFailed.mockResolvedValue(true)

        await handler.handle({
            kind: 'purchase_failed',
            providerEventId: 'event-failed-1',
            providerReference: paidEvent.providerReference,
        })

        expect(purchases.recordFailed).toHaveBeenCalledWith(paidEvent.providerReference)
        expect(credits.credit).not.toHaveBeenCalled()
    })

    it('does nothing for an ignored provider event', async () => {
        await handler.handle({ kind: 'ignored', providerEventId: 'event-ignored-1' })

        expect(purchases.recordPaid).not.toHaveBeenCalled()
        expect(purchases.recordFailed).not.toHaveBeenCalled()
    })
})
