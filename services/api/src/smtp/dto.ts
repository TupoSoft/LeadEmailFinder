import type { SmtpStatusCode } from './enums'

export enum SmtpVerificationReasonEnum {
    AcceptedEmail = 'accepted_email',
    RejectedEmail = 'rejected_email',
    Timeout = 'timeout',
    TemporarilyBlocked = 'temporarily_blocked',
    NoMxRecords = 'no_mx_records',
    UnexpectedError = 'unexpected_error',
    Blocked = 'blocked',
    NoConnect = 'no_connect',
}

export type SmtpVerificationReason = `${SmtpVerificationReasonEnum}`

export type SmtpVerificationResult = {
    email: string
    reason: SmtpVerificationReason
} & (
    | {
          exists: null
          targetExchange?: string
      }
    | {
          exists: boolean
          targetExchange: string
      }
)

export interface SmtpResponse {
    code: SmtpStatusCode
    enhancedCode: string
    message: string
}
