import type { SmtpResponseCode } from './enums'
import type { EmailVerificationResult } from '../email-verification'

export interface SMTPVerificationResult extends EmailVerificationResult {
    catchAll?: boolean
    mxRecord?: string
    mxDomain?: string
}

export interface SmtpResponse {
    code: SmtpResponseCode
    enhancedCode: string | undefined
    message: string
}
