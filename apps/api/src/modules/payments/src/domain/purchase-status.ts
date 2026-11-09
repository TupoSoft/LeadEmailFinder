export const PURCHASE_STATUSES = ['pending', 'paid', 'failed', 'expired'] as const

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]
