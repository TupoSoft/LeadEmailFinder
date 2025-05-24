import { SmtpErrorStatusCode, SmtpOkStatusCode } from '../enums'

export interface SmtpResponse {
    code: SmtpOkStatusCode | SmtpErrorStatusCode
    enhancedCode: string
    message: string
}
