import type { CatchAllStatus, DeliveryStatus } from '../enums'
import type { CatchAllVerificationSource } from '../../application/use-cases/verify-email/catch-all'

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'

export interface EmailVerification {
    catchAll: CatchAllStatus
    deliveryStatus: DeliveryStatus
    domain: string
    email: string
    error?: string
    localPart: string
    mxDomain?: string
    source?: EmailVerificationSource
    targetExchange?: string
    verifiedAt: Date
    success: boolean
}
