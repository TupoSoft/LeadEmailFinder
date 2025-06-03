import { EmailPatternEnum, EmailVerificationReason } from '../../common'
import { CatchAllStatus, DeliveryStatus } from './old-email-verification.enums'

export interface OldEmailVerificationResponse {
    email: string

    domain: string

    localPart: string

    deliveryStatus: DeliveryStatus

    catchAll: CatchAllStatus

    reason: EmailVerificationReason

    targetExchange?: string

    mxDomain?: string

    format?: EmailPatternEnum

    verifiedAt: string
}
