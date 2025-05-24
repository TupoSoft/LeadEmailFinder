import { parseTimeString } from '../common'
import type { SmtpClientTimeoutConfig } from './client'

export const SMTP_PORT = 25
export const DEFAULT_SMTP_CLIENT_TIMEOUT = parseTimeString('1m')
export const DEFAULT_GREETING_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.1
export const DEFAULT_MAIL_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.2
export const DEFAULT_RCPT_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.3
export const SMTP_RESPONSE_REGEX = /^[0-9]{3} (?:.|\s)*$/m

export const DEFAULT_TIMEOUT_CONFIG: Readonly<Required<SmtpClientTimeoutConfig>> = {
    greeting: DEFAULT_GREETING_TIMEOUT,
    mail: DEFAULT_MAIL_TIMEOUT,
    rcpt: DEFAULT_RCPT_TIMEOUT,
}
