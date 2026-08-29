export const PAYMENT_ADJUSTMENT_STORE = Symbol('PAYMENT_ADJUSTMENT_STORE')

export enum PaymentAdjustmentDirection {
    DEBIT = 'debit',
    RESTORE = 'restore',
}

export interface PaymentAdjustmentClaimInput {
    providerEventId: string
    providerReference: string
    providerAdjustmentId: string
    direction: PaymentAdjustmentDirection
    amountMinor: number
    currency: string
}

export interface ClaimedPaymentAdjustment {
    providerAdjustmentId: string
    organizationId: string
    direction: PaymentAdjustmentDirection
    operationCredits: number
    ledgerReference: string
    completed: boolean
}

export class PaymentAdjustmentCurrencyMismatchError extends Error {
    constructor(
        public readonly providerAdjustmentId: string,
        public readonly expectedCurrency: string,
        public readonly receivedCurrency: string,
    ) {
        super(`Payment adjustment ${providerAdjustmentId} uses a different currency from its purchase`)
        this.name = PaymentAdjustmentCurrencyMismatchError.name
    }
}

export class PaymentAdjustmentReplayConflictError extends Error {
    constructor(public readonly providerAdjustmentId: string) {
        super(`Payment adjustment ${providerAdjustmentId} was replayed with different financial details`)
        this.name = PaymentAdjustmentReplayConflictError.name
    }
}

export class PaymentAdjustmentPurchaseNotReadyError extends Error {
    constructor(public readonly providerReference: string) {
        super(`Payment adjustment purchase ${providerReference} has not completed its credit grant`)
        this.name = PaymentAdjustmentPurchaseNotReadyError.name
    }
}

export class PaymentAdjustmentDirectionInProgressError extends Error {
    constructor(public readonly providerReference: string) {
        super(`An opposite-direction adjustment is still in progress for purchase ${providerReference}`)
        this.name = PaymentAdjustmentDirectionInProgressError.name
    }
}

export interface PaymentAdjustmentStore {
    claim(input: PaymentAdjustmentClaimInput): Promise<ClaimedPaymentAdjustment | null>
    complete(providerAdjustmentId: string, appliedCredits: number): Promise<void>
}
