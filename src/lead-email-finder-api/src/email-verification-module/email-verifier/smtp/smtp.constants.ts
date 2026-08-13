import { parseTimeString } from '@tuposoft/lead-email-finder/common'

export const SMTP_PORT = 25
export const DEFAULT_SMTP_CLIENT_TIMEOUT = parseTimeString('1m')
export const DEFAULT_GREETING_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.1
export const DEFAULT_MAIL_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.2
export const DEFAULT_RCPT_TIMEOUT = parseTimeString('5m') // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.3
export const SMTP_RESPONSE_REGEX = /^[0-9]{3} (?:.|\s)*$/m

export const DNS_SERVICE_TOKEN = 'DnsService'
export const PROXY_SERVICE_TOKEN = 'ProxyService'
export const SMTP_CLIENT_FACTORY_TOKEN = 'SmtpClientFactory'
