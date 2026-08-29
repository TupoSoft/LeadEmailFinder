import { PaymentAdjustmentDirection } from './payment-adjustment.store'

export interface PaymentAdjustmentPurchaseTerms {
    basisMinor: number
    credits: number
}

export interface PaymentAdjustmentAccountingRecord {
    providerAdjustmentId: string
    direction: PaymentAdjustmentDirection
    amountMinor: number
    isFull: boolean
    operationCredits: number
    appliedDebit: number
    shortfallCredits: number
}

export interface PaymentAdjustmentShortfallUpdate {
    providerAdjustmentId: string
    remainingShortfallCredits: number
}

export interface PaymentAdjustmentClaimAccounting {
    effectiveAmountMinor: number
    requestedCredits: number
    operationCredits: number
    shortfallClearedCredits: number
    shortfallUpdates: PaymentAdjustmentShortfallUpdate[]
}

export function calculatePaymentAdjustmentClaim(
    purchase: PaymentAdjustmentPurchaseTerms,
    existing: PaymentAdjustmentAccountingRecord[],
    direction: PaymentAdjustmentDirection,
    amountMinor: number,
    isFull: boolean,
): PaymentAdjustmentClaimAccounting {
    assertPurchaseTerms(purchase)
    assertNonNegativeInteger(amountMinor, 'amountMinor')

    const previousTarget = calculateTarget(purchase, existing)
    const nextTarget = calculateTarget(purchase, [
        ...existing,
        {
            providerAdjustmentId: 'pending',
            direction,
            amountMinor,
            isFull,
            operationCredits: 0,
            appliedDebit: 0,
            shortfallCredits: 0,
        },
    ])
    const requestedCredits =
        direction === PaymentAdjustmentDirection.DEBIT
            ? Math.max(0, nextTarget.credits - previousTarget.credits)
            : Math.max(0, previousTarget.credits - nextTarget.credits)

    if (direction === PaymentAdjustmentDirection.DEBIT) {
        return {
            effectiveAmountMinor: nextTarget.amountMinor,
            requestedCredits,
            operationCredits: requestedCredits,
            shortfallClearedCredits: 0,
            shortfallUpdates: [],
        }
    }

    const totalAppliedDebit = existing.reduce((sum, candidate) => sum + candidate.appliedDebit, 0)
    const reservedRestore = existing
        .filter(candidate => candidate.direction === PaymentAdjustmentDirection.RESTORE)
        .reduce((sum, candidate) => sum + candidate.operationCredits, 0)
    const outstandingShortfall = existing.reduce((sum, candidate) => sum + candidate.shortfallCredits, 0)
    const shortfallClearedCredits = Math.min(requestedCredits, outstandingShortfall)
    const operationCredits = Math.min(
        requestedCredits - shortfallClearedCredits,
        Math.max(0, totalAppliedDebit - reservedRestore),
    )

    let remainingToClear = shortfallClearedCredits
    const shortfallUpdates: PaymentAdjustmentShortfallUpdate[] = []
    for (const candidate of existing) {
        if (remainingToClear === 0) break

        const cleared = Math.min(candidate.shortfallCredits, remainingToClear)
        if (cleared === 0) continue

        remainingToClear -= cleared
        shortfallUpdates.push({
            providerAdjustmentId: candidate.providerAdjustmentId,
            remainingShortfallCredits: candidate.shortfallCredits - cleared,
        })
    }

    return {
        effectiveAmountMinor: nextTarget.amountMinor,
        requestedCredits,
        operationCredits,
        shortfallClearedCredits,
        shortfallUpdates,
    }
}

function calculateTarget(
    purchase: PaymentAdjustmentPurchaseTerms,
    adjustments: PaymentAdjustmentAccountingRecord[],
): { amountMinor: number; credits: number } {
    let netMinor = 0n
    for (const adjustment of adjustments) {
        const amount = BigInt(adjustment.isFull ? purchase.basisMinor : adjustment.amountMinor)
        netMinor += adjustment.direction === PaymentAdjustmentDirection.DEBIT ? amount : -amount
    }

    const cappedMinor =
        netMinor < 0n ? 0n : netMinor > BigInt(purchase.basisMinor) ? BigInt(purchase.basisMinor) : netMinor
    const credits = Number((cappedMinor * BigInt(purchase.credits)) / BigInt(purchase.basisMinor))
    return { amountMinor: Number(cappedMinor), credits }
}

function assertPurchaseTerms(purchase: PaymentAdjustmentPurchaseTerms): void {
    if (!Number.isSafeInteger(purchase.basisMinor) || purchase.basisMinor <= 0) {
        throw new Error('Payment purchase basisMinor must be a positive safe integer')
    }
    assertNonNegativeInteger(purchase.credits, 'credits')
}

function assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Payment adjustment ${field} must be a non-negative safe integer`)
    }
}
