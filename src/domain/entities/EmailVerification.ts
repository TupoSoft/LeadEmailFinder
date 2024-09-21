import type { CatchAllStatus, DeliveryStatus, SMTPVerificationError } from '../enums'
import type { CatchAllVerificationSource } from '../../application/use-cases/verify-email/CatchAllVerifier'

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP' | 'None'

export interface EmailVerification {
    catchAll: CatchAllStatus
    deliveryStatus: DeliveryStatus
    domain: string
    email: string
    error?: SMTPVerificationError
    localPart: string
    mxDomain?: string
    source?: EmailVerificationSource
    targetExchange?: string
    verifiedAt: Date
}
