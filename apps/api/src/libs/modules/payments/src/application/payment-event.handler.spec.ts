import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import { PaymentEventHandler } from './payment-event.handler'
import { PaymentEventLogger } from './ports/payment-event-logger'
import { PaidPurchase, PaymentPurchaseStore, PurchaseReferenceConflictError } from './ports/payment-purchase-store'

const paidEvent = {
    kind: 'purchase_paid' as const,
    providerEventId: 'event-paid-1',
    providerReference: 'provider-purchase-1',
    providerTotalMinor: 500,
    currency: 'USD',
}

const purchase: PaidPurchase = {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    credits: 100,
}

describe('PaymentEventHandler', () => {
    let purchases: jest.Mocked<PaymentPurchaseStore>
    let credits: jest.Mocked<Pick<CreditsService, 'credit'>>
    let adjustmentHandler: jest.Mocked<Pick<PaymentAdjustmentHandler, 'handle'>>
    let log: jest.Mocked<PaymentEventLogger>
    let handler: PaymentEventHandler

    beforeEach(() => {
        purchases = {
            create: jest.fn(),
            bindProviderReference: jest.fn(),
            markFailed: jest.fn(),
            listForOrganization: jest.fn(),
            recordPaid: jest.fn(),
            recordCreditsGranted: jest.fn(),
            recordFailed: jest.fn(),
        }
        credits = { credit: jest.fn() }
        adjustmentHandler = { handle: jest.fn() }
        log = { warnUnknownEvent: jest.fn(), errorConflict: jest.fn() }
        handler = new PaymentEventHandler(
            purchases,
            credits as unknown as CreditsService,
            adjustmentHandler as unknown as PaymentAdjustmentHandler,
            log,
        )
    })

    it('grants stored purchase credits using the purchase id', async () => {
        purchases.recordPaid.mockResolvedValue(purchase)

        await handler.handle(paidEvent)

        expect(purchases.recordPaid).toHaveBeenCalledWith({
            providerReference: paidEvent.providerReference,
            purchaseId: undefined,
            providerTotalMinor: paidEvent.providerTotalMinor,
            currency: paidEvent.currency,
        })
        expect(credits.credit).toHaveBeenCalledWith(purchase.organizationId, purchase.credits, purchase.id)
        expect(purchases.recordCreditsGranted).toHaveBeenCalledWith(purchase.id)
    })

    it('forwards the event purchase id as a correlation fallback', async () => {
        purchases.recordPaid.mockResolvedValue(purchase)

        await handler.handle({ ...paidEvent, purchaseId: purchase.id })

        expect(purchases.recordPaid).toHaveBeenCalledWith({
            providerReference: paidEvent.providerReference,
            purchaseId: purchase.id,
            providerTotalMinor: paidEvent.providerTotalMinor,
            currency: paidEvent.currency,
        })
    })

    it('retries the idempotent grant when a paid event is replayed', async () => {
        purchases.recordPaid.mockResolvedValue(purchase)

        await handler.handle(paidEvent)
        await handler.handle(paidEvent)

        expect(credits.credit).toHaveBeenCalledTimes(2)
        expect(credits.credit).toHaveBeenNthCalledWith(2, purchase.organizationId, purchase.credits, purchase.id)
    })

    it('does not mark the purchase grant complete when credit application fails', async () => {
        const failure = new Error('credit grant failed')
        purchases.recordPaid.mockResolvedValue(purchase)
        credits.credit.mockRejectedValue(failure)

        await expect(handler.handle(paidEvent)).rejects.toBe(failure)

        expect(purchases.recordCreditsGranted).not.toHaveBeenCalled()
    })

    it('surfaces a grant-marker failure so replay can finish the durable handoff', async () => {
        const failure = new Error('grant marker failed')
        purchases.recordPaid.mockResolvedValue(purchase)
        purchases.recordCreditsGranted.mockRejectedValueOnce(failure)

        await expect(handler.handle(paidEvent)).rejects.toBe(failure)
        await expect(handler.handle(paidEvent)).resolves.toBeUndefined()

        expect(credits.credit).toHaveBeenCalledTimes(2)
        expect(purchases.recordCreditsGranted).toHaveBeenCalledTimes(2)
    })

    it('acknowledges an unknown provider reference without changing credits, and logs it', async () => {
        purchases.recordPaid.mockResolvedValue(null)

        await handler.handle(paidEvent)

        expect(credits.credit).not.toHaveBeenCalled()
        expect(log.warnUnknownEvent).toHaveBeenCalledWith(paidEvent.providerEventId, paidEvent.providerReference)
    })

    it('records a failed purchase without changing credits', async () => {
        purchases.recordFailed.mockResolvedValue(true)

        await handler.handle({
            kind: 'purchase_failed',
            providerEventId: 'event-failed-1',
            providerReference: paidEvent.providerReference,
        })

        expect(purchases.recordFailed).toHaveBeenCalledWith({
            providerReference: paidEvent.providerReference,
            purchaseId: undefined,
        })
        expect(credits.credit).not.toHaveBeenCalled()
    })

    it('logs an unknown failed-purchase event', async () => {
        purchases.recordFailed.mockResolvedValue(false)

        await handler.handle({
            kind: 'purchase_failed',
            providerEventId: 'event-failed-1',
            providerReference: paidEvent.providerReference,
        })

        expect(log.warnUnknownEvent).toHaveBeenCalledWith('event-failed-1', paidEvent.providerReference)
    })

    it('does nothing for an ignored provider event', async () => {
        await handler.handle({ kind: 'ignored', providerEventId: 'event-ignored-1' })

        expect(purchases.recordPaid).not.toHaveBeenCalled()
        expect(purchases.recordFailed).not.toHaveBeenCalled()
        expect(adjustmentHandler.handle).not.toHaveBeenCalled()
        expect(log.warnUnknownEvent).not.toHaveBeenCalled()
    })

    it('delegates adjustment events to the adjustment handler', async () => {
        const event = {
            kind: 'purchase_adjustment_debit' as const,
            providerEventId: 'event-adjustment-1',
            providerReference: paidEvent.providerReference,
            providerAdjustmentId: 'adjustment-1',
            amountMinor: 250,
            isFull: false,
            currency: 'USD',
        }
        adjustmentHandler.handle.mockResolvedValue(true)

        await handler.handle(event)

        expect(adjustmentHandler.handle).toHaveBeenCalledWith(event)
        expect(purchases.recordPaid).not.toHaveBeenCalled()
        expect(credits.credit).not.toHaveBeenCalled()
    })

    it('logs an unknown adjustment event', async () => {
        const event = {
            kind: 'purchase_adjustment_debit' as const,
            providerEventId: 'event-adjustment-1',
            providerReference: paidEvent.providerReference,
            providerAdjustmentId: 'adjustment-1',
            amountMinor: 250,
            isFull: false,
            currency: 'USD',
        }
        adjustmentHandler.handle.mockResolvedValue(false)

        await handler.handle(event)

        expect(log.warnUnknownEvent).toHaveBeenCalledWith('event-adjustment-1', paidEvent.providerReference)
    })

    it('lets a purchase-reference conflict surface for provider retry without granting credits, and logs it', async () => {
        const conflict = new PurchaseReferenceConflictError(purchase.id, 'established-reference')
        purchases.recordPaid.mockRejectedValue(conflict)

        await expect(handler.handle({ ...paidEvent, purchaseId: purchase.id })).rejects.toBe(conflict)

        expect(credits.credit).not.toHaveBeenCalled()
        expect(log.errorConflict).toHaveBeenCalledWith(
            paidEvent.providerEventId,
            paidEvent.providerReference,
            purchase.id,
        )
    })
})
