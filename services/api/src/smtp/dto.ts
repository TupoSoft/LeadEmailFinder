import type { SmtpResponseCode } from './enums'
import type { EmailVerificationResult } from '../email-verification'

export const enum CatchAllStatus {
    Enabled = 'enabled',
    Disabled = 'disabled',
    Unknown = 'unknown',
}

export interface SMTPVerificationResult extends EmailVerificationResult {
    catchAll?: CatchAllStatus
    mxRecord?: string
    mxDomain?: string
}

export interface SmtpResponse {
    code: SmtpResponseCode
    enhancedCode: string | undefined
    message: string
}
