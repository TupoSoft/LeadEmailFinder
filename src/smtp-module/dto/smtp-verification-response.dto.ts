import { SmtpVerificationReason } from '../enums'

export class SmtpVerificationResponse {
    email: string
    reason: SmtpVerificationReason
    exists: boolean | null
    targetExchange?: string
    proxyId?: string
}
