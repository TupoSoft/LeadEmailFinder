import type { DeliveryStatus } from './enums'
import type { CatchAllStatus } from '../../smtp/dto'

export interface LegacyEmailVerificationResult {
    email: string
    localPart: string
    domain: string
    targetExchange?: string
    verifiedAt: Date
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}
