import type { SmtpResponseCode } from './enums'

export type SMTPVerificationResult =
    | {
          exists: null
          targetExchange?: string
      }
    | {
          exists: true | false
          targetExchange: string
      }

export interface SmtpResponse {
    code: SmtpResponseCode
    enhancedCode: string | undefined
    message: string
}
