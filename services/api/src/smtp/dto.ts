import type { SmtpResponseCode } from './enums'

export interface SMTPVerificationResult {
    exists?: boolean
    catchAllStatus?: boolean
    targetExchange?: string
    mxDomain?: string
}

export interface SmtpResponse {
    code: SmtpResponseCode
    enhancedCode: string | undefined
    message: string
}
