import type { MxRecord } from 'node:dns'
import type { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../enums'

export interface EmailVerification {
    email: string
    localPart: string
    domain: string
    error: SMTPVerificationError | null
    targetExchange?: MxRecord
    verifiedAt: Date
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}
