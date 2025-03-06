import type { SmtpStatusCode } from './enums'

export enum SmtpVerificationReasonEnum {
    AcceptedEmail = 'accepted_email',
    RejectedEmail = 'rejected_email',
    Timeout = 'timeout',
    TemporarilyBlocked = 'temporarily_blocked',
    NoMxRecords = 'no_mx_records',
    UnexpectedError = 'unexpected_error',
    Blocked = 'blacklisted',
    NoConnect = 'no_connect',
    ExceededStorage = 'exceeded_storage',
    SenderBlocked = 'sender_blocked',
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
