import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentAdjustmentDirection } from '../domain/payment-adjustment-direction'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import { PaymentAdjustmentStore } from './ports/payment-adjustment-store'

const debitEvent = {
    kind: 'purchase_adjustment_debit' as const,
    providerEventId: 'event-debit-1',
    providerReference: 'transaction-1',
    providerAdjustmentId: 'adjustment-1',
    amountMinor: 500,
    isFull: true,
    currency: 'USD',
}

describe('PaymentAdjustmentHandler', () => {
    let adjustments: jest.Mocked<PaymentAdjustmentStore>
    let credits: jest.Mocked<Pick<CreditsService, 'debitUpTo' | 'creditOnce'>>
    let handler: PaymentAdjustmentHandler

    beforeEach(() => {
        adjustments = { claim: jest.fn(), complete: jest.fn() }
        credits = { debitUpTo: jest.fn(), creditOnce: jest.fn() }
        handler = new PaymentAdjustmentHandler(adjustments, credits as unknown as CreditsService)
    })

    it('claims, clamps, and completes a debit adjustment', async () => {
        adjustments.claim.mockResolvedValue({
            providerAdjustmentId: debitEvent.providerAdjustmentId,
            organizationId: 'organization-1',
            direction: PaymentAdjustmentDirection.DEBIT,
            operationCredits: 100,
            ledgerReference: 'payment-adjustment:adjustment-1:debit',
            completed: false,
        })
        credits.debitUpTo.mockResolvedValue(30)

        await expect(handler.handle(debitEvent)).resolves.toBe(true)

        expect(adjustments.claim).toHaveBeenCalledWith({
            providerEventId: debitEvent.providerEventId,
            providerReference: debitEvent.providerReference,
            providerAdjustmentId: debitEvent.providerAdjustmentId,
            direction: PaymentAdjustmentDirection.DEBIT,
            amountMinor: debitEvent.amountMinor,
            isFull: debitEvent.isFull,
            currency: debitEvent.currency,
        })
        expect(credits.debitUpTo).toHaveBeenCalledWith(
            'organization-1',
            100,
            'payment-adjustment:adjustment-1:debit',
        )
        expect(adjustments.complete).toHaveBeenCalledWith(debitEvent.providerAdjustmentId, 30)
    })

    it('applies a restore through the idempotent credit operation', async () => {
        adjustments.claim.mockResolvedValue({
            providerAdjustmentId: 'restore-1',
            organizationId: 'organization-1',
            direction: PaymentAdjustmentDirection.RESTORE,
            operationCredits: 30,
            ledgerReference: 'payment-adjustment:restore-1:restore',
            completed: false,
        })
        credits.creditOnce.mockResolvedValue(30)

        await expect(
            handler.handle({
                ...debitEvent,
                kind: 'purchase_adjustment_restore',
                providerAdjustmentId: 'restore-1',
            }),
        ).resolves.toBe(true)

        expect(credits.creditOnce).toHaveBeenCalledWith(
            'organization-1',
            30,
            'payment-adjustment:restore-1:restore',
        )
        expect(adjustments.complete).toHaveBeenCalledWith('restore-1', 30)
    })

    it('acknowledges an unknown purchase without writing a ledger operation', async () => {
        adjustments.claim.mockResolvedValue(null)

        await expect(handler.handle(debitEvent)).resolves.toBe(false)

        expect(credits.debitUpTo).not.toHaveBeenCalled()
        expect(adjustments.complete).not.toHaveBeenCalled()
    })

    it('skips ledger work for an already completed replay', async () => {
        adjustments.claim.mockResolvedValue({
            providerAdjustmentId: debitEvent.providerAdjustmentId,
            organizationId: 'organization-1',
            direction: PaymentAdjustmentDirection.DEBIT,
            operationCredits: 100,
            ledgerReference: 'payment-adjustment:adjustment-1:debit',
            completed: true,
        })

        await expect(handler.handle(debitEvent)).resolves.toBe(true)

        expect(credits.debitUpTo).not.toHaveBeenCalled()
        expect(adjustments.complete).not.toHaveBeenCalled()
    })

    it('leaves a claim retryable when the credit operation fails', async () => {
        adjustments.claim.mockResolvedValue({
            providerAdjustmentId: debitEvent.providerAdjustmentId,
            organizationId: 'organization-1',
            direction: PaymentAdjustmentDirection.DEBIT,
            operationCredits: 100,
            ledgerReference: 'payment-adjustment:adjustment-1:debit',
            completed: false,
        })
        credits.debitUpTo.mockRejectedValue(new Error('credit database unavailable'))

        await expect(handler.handle(debitEvent)).rejects.toThrow('credit database unavailable')
        expect(adjustments.complete).not.toHaveBeenCalled()
    })

    it('retries the same ledger reference when completion fails after credit application', async () => {
        adjustments.claim.mockResolvedValue({
            providerAdjustmentId: debitEvent.providerAdjustmentId,
            organizationId: 'organization-1',
            direction: PaymentAdjustmentDirection.DEBIT,
            operationCredits: 100,
            ledgerReference: 'payment-adjustment:adjustment-1:debit',
            completed: false,
        })
        credits.debitUpTo.mockResolvedValue(30)
        adjustments.complete.mockRejectedValueOnce(new Error('completion unavailable')).mockResolvedValueOnce()

        await expect(handler.handle(debitEvent)).rejects.toThrow('completion unavailable')
        await expect(handler.handle(debitEvent)).resolves.toBe(true)

        expect(credits.debitUpTo).toHaveBeenCalledTimes(2)
        expect(credits.debitUpTo).toHaveBeenNthCalledWith(
            2,
            'organization-1',
            100,
            'payment-adjustment:adjustment-1:debit',
        )
        expect(adjustments.complete).toHaveBeenCalledTimes(2)
    })
})
