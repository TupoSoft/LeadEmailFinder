export const PAYMENT_PURCHASE_STORE = Symbol('PAYMENT_PURCHASE_STORE')

export interface PaidPurchase {
    id: string
    organizationId: string
    credits: number
}

export interface PaymentPurchaseStore {
    recordPaid(providerReference: string): Promise<PaidPurchase | null>
    recordFailed(providerReference: string): Promise<boolean>
}
