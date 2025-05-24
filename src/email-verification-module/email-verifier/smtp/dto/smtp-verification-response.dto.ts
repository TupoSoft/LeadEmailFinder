import { SmtpVerificationReason } from '../enums'
import { ISmtpVerificationResponse } from '../../../../common'

export class SmtpVerificationResponse implements ISmtpVerificationResponse {
    email: string
    reason: SmtpVerificationReason
    exists: boolean | null
    targetExchange?: string
    proxyId?: string
}
