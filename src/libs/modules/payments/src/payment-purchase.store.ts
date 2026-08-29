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

export class PurchaseReferenceConflictError extends Error {
    constructor(
        public readonly purchaseId: string,
        public readonly existingProviderReference: string,
    ) {
        super(`Purchase ${purchaseId} is already bound to a different provider reference`)
        this.name = PurchaseReferenceConflictError.name
    }
}

export interface PaymentPurchaseStore {
    recordPaid(correlation: PurchaseCorrelation): Promise<PaidPurchase | null>
    recordCreditsGranted(purchaseId: string): Promise<void>
    recordFailed(correlation: PurchaseCorrelation): Promise<boolean>
}
