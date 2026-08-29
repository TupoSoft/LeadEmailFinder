import {
    calculatePaymentAdjustmentClaim,
    PaymentAdjustmentAccountingRecord,
} from './payment-adjustment-accounting'
import { PaymentAdjustmentDirection } from './payment-adjustment.store'

const purchase = { amountMinor: 500, credits: 100 }

function record(
    providerAdjustmentId: string,
    direction: PaymentAdjustmentDirection,
    amountMinor: number,
    overrides: Partial<PaymentAdjustmentAccountingRecord> = {},
): PaymentAdjustmentAccountingRecord {
    return {
        providerAdjustmentId,
        direction,
        amountMinor,
        operationCredits: 0,
        appliedDebit: 0,
        shortfallCredits: 0,
        ...overrides,
    }
}

describe('payment adjustment accounting', () => {
    it('requests every granted credit for a full debit adjustment', () => {
        expect(calculatePaymentAdjustmentClaim(purchase, [], PaymentAdjustmentDirection.DEBIT, 500)).toMatchObject({
            effectiveAmountMinor: 500,
            requestedCredits: 100,
            operationCredits: 100,
        })
    })

    it('rounds a partial adjustment down in the customer favor', () => {
        expect(calculatePaymentAdjustmentClaim(purchase, [], PaymentAdjustmentDirection.DEBIT, 333)).toMatchObject({
            effectiveAmountMinor: 333,
            requestedCredits: 66,
            operationCredits: 66,
        })
    })

    it('uses the cumulative target so tiny partials eventually reach the full credit amount', () => {
        const terms = { amountMinor: 6, credits: 10 }
        const existing: PaymentAdjustmentAccountingRecord[] = []
        let requested = 0

        for (let index = 0; index < 3; index += 1) {
            const claim = calculatePaymentAdjustmentClaim(terms, existing, PaymentAdjustmentDirection.DEBIT, 2)
            requested += claim.requestedCredits
            existing.push(
                record(`debit-${index}`, PaymentAdjustmentDirection.DEBIT, 2, {
                    operationCredits: claim.operationCredits,
                    appliedDebit: claim.operationCredits,
                }),
            )
        }

        expect(requested).toBe(10)
    })

    it('caps distinct debit adjustments at the credits granted by the purchase', () => {
        const existing = [
            record('debit-1', PaymentAdjustmentDirection.DEBIT, 400, {
                operationCredits: 80,
                appliedDebit: 80,
            }),
        ]

        expect(calculatePaymentAdjustmentClaim(purchase, existing, PaymentAdjustmentDirection.DEBIT, 400)).toMatchObject({
            effectiveAmountMinor: 500,
            requestedCredits: 20,
            operationCredits: 20,
        })
    })

    it('clears shortfall before restoring credits that were actually debited', () => {
        const existing = [
            record('debit-1', PaymentAdjustmentDirection.DEBIT, 500, {
                operationCredits: 100,
                appliedDebit: 30,
                shortfallCredits: 70,
            }),
        ]

        expect(
            calculatePaymentAdjustmentClaim(purchase, existing, PaymentAdjustmentDirection.RESTORE, 500),
        ).toEqual({
            effectiveAmountMinor: 0,
            requestedCredits: 100,
            operationCredits: 30,
            shortfallClearedCredits: 70,
            shortfallUpdates: [{ providerAdjustmentId: 'debit-1', remainingShortfallCredits: 0 }],
        })
    })

    it('reopens debit capacity after a completed full restore', () => {
        const existing = [
            record('debit-1', PaymentAdjustmentDirection.DEBIT, 500, {
                operationCredits: 100,
                appliedDebit: 100,
            }),
            record('restore-1', PaymentAdjustmentDirection.RESTORE, 500, { operationCredits: 100 }),
        ]

        expect(calculatePaymentAdjustmentClaim(purchase, existing, PaymentAdjustmentDirection.DEBIT, 500)).toMatchObject({
            effectiveAmountMinor: 500,
            requestedCredits: 100,
            operationCredits: 100,
        })
    })

    it('converges when an inverse is delivered before its debit adjustment', () => {
        const inverseFirst = [record('restore-1', PaymentAdjustmentDirection.RESTORE, 500)]

        expect(
            calculatePaymentAdjustmentClaim(purchase, inverseFirst, PaymentAdjustmentDirection.DEBIT, 500),
        ).toMatchObject({
            effectiveAmountMinor: 0,
            requestedCredits: 0,
            operationCredits: 0,
        })
    })

    it('applies only the net amount when an early inverse is partial', () => {
        const inverseFirst = [record('restore-1', PaymentAdjustmentDirection.RESTORE, 250)]

        expect(
            calculatePaymentAdjustmentClaim(purchase, inverseFirst, PaymentAdjustmentDirection.DEBIT, 500),
        ).toMatchObject({
            effectiveAmountMinor: 250,
            requestedCredits: 50,
            operationCredits: 50,
        })
    })
})
