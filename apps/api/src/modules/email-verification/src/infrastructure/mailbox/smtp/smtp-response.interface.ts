import { SmtpErrorStatusCode, SmtpOkStatusCode } from './smtp.enums'

export interface SmtpResponse {
    code: SmtpOkStatusCode | SmtpErrorStatusCode
    enhancedCode: string
    message: string
    lines: string[]
    capabilities: string[]
}
