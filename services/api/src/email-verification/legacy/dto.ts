import type { CatchAllStatus, DeliveryStatus } from './enums'

export interface LegacyEmailVerificationResult {
    email: string
    localPart: string
    domain: string
    targetExchange?: string
    verifiedAt: Date
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}
