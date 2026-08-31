import { PurchaseStatus } from './purchase-status'

export interface PurchaseRecord {
    readonly id: string
    readonly organizationId: string
    readonly packId: string
    readonly credits: number
    readonly amountMinor: number
    readonly currency: string
    readonly provider: string
    readonly providerReference: string | null
    readonly providerTotalMinor: number | null
    readonly status: PurchaseStatus
    readonly creditsGrantedAt: Date | null
    readonly createdAt: Date
    readonly updatedAt: Date
}
