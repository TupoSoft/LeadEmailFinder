const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi
const EMAIL_PATTERN = /[^\s"'<>@]+@[^\s"'<>@]+/g
const TOKEN_PATTERN = /[A-Za-z0-9_\-.~+/=]{24,}/g
// Table and column names such as better_auth_verifications are diagnostics, not secrets.
const SNAKE_CASE_IDENTIFIER = /^[a-z]+(?:_[a-z]+)+$/

/** Native log messages may interpolate redirect URLs, origins, or identifiers carrying sign-in secrets. */
export function redactNativeLogMessage(message: string): string {
    return message
        .replace(URL_PATTERN, '[url]')
        .replace(EMAIL_PATTERN, '[email]')
        .replace(TOKEN_PATTERN, value => (SNAKE_CASE_IDENTIFIER.test(value) ? value : '[redacted]'))
}
