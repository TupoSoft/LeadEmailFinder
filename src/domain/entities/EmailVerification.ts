import type { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../enums'

export interface EmailVerification {
    email: string
    localPart: string
    domain: string
    error?: SMTPVerificationError
    targetExchange?: string
    verifiedAt: Date
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}
