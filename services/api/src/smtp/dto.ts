import type { SmtpResponseCode } from './enums'
import type { EmailVerificationResult } from '../email-verification'

export interface SMTPVerificationResult extends EmailVerificationResult {
    exists?: boolean
    catchAll?: boolean
    targetExchange?: string
    mxDomain?: string
}

export interface SmtpResponse {
    code: SmtpResponseCode
    enhancedCode: string | undefined
    message: string
}
