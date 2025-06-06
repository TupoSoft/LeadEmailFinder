import type { SmtpStatusCode } from './enums'

export enum SmtpVerificationReasonEnum {
    Unknown = 'unknown',
}

export type SmtpVerificationReason = `${SmtpVerificationReasonEnum}`

export interface SmtpVerificationResult {
    reason: SmtpVerificationReason
    exists: boolean | null
    targetExchange?: string
    proxyId?: string
}

export interface SmtpVerifyResponse extends SmtpVerificationResult {
    email: string
}

export interface SmtpResponse {
    code: SmtpStatusCode
    enhancedCode: string
    message: string
}
