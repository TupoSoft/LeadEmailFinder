export const PAYMENT_PURCHASE_STORE = Symbol('PAYMENT_PURCHASE_STORE')

export interface PaidPurchase {
    id: string
    organizationId: string
    credits: number
}

export interface PurchaseCorrelation {
    providerReference: string
    purchaseId?: string
}

export interface PaidPurchaseCorrelation extends PurchaseCorrelation {
    providerTotalMinor: number
    currency: string
}

export class PurchaseReferenceConflictError extends Error {
    constructor(
        public readonly purchaseId: string,
        public readonly existingProviderReference: string,
    ) {
        super(`Purchase ${purchaseId} is already bound to a different provider reference`)
        this.name = PurchaseReferenceConflictError.name
    }
}

export class PurchaseCurrencyMismatchError extends Error {
    constructor(
        public readonly purchaseId: string,
        public readonly expectedCurrency: string,
        public readonly receivedCurrency: string,
    ) {
        super(`Paid purchase ${purchaseId} uses a different currency from its catalog entry`)
        this.name = PurchaseCurrencyMismatchError.name
    }
}

export class PurchaseProviderTotalConflictError extends Error {
    constructor(
        public readonly purchaseId: string,
        public readonly expectedProviderTotalMinor: number,
        public readonly receivedProviderTotalMinor: number,
    ) {
        super(`Paid purchase ${purchaseId} was replayed with a different provider total`)
        this.name = PurchaseProviderTotalConflictError.name
    }
}

export interface PaymentPurchaseStore {
    recordPaid(correlation: PaidPurchaseCorrelation): Promise<PaidPurchase | null>
    recordCreditsGranted(purchaseId: string): Promise<void>
    recordFailed(correlation: PurchaseCorrelation): Promise<boolean>
}
