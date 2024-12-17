const MILLIS_IN_SECOND = 1000
const DEFAULT_SMTP_CLIENT_SOCKET_TIMEOUT_SECONDS = 60

export const SMTP_PORT = 25
export const DEFAULT_SMTP_CLIENT_TIMEOUT = DEFAULT_SMTP_CLIENT_SOCKET_TIMEOUT_SECONDS * MILLIS_IN_SECOND
export const SESSION_INITIATION_TIMEOUT = 10 * MILLIS_IN_SECOND
export const GREETING_TIMEOUT = 5 * 60 * MILLIS_IN_SECOND // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.1
export const MAIL_FROM_TIMEOUT = 5 * 60 * MILLIS_IN_SECOND // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.2
export const RCPT_TO_TIMEOUT = 10 * MILLIS_IN_SECOND // https://datatracker.ietf.org/doc/html/rfc5321#section-4.5.3.2.3
export const QUIT_TIMEOUT = 10 * MILLIS_IN_SECOND

export const SMTP_RESPONSE_REGEX = /^[0-9]{3} (?:.|\s)*$/m
