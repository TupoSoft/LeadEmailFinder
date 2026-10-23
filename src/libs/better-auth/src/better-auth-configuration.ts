export const BETTER_AUTH_CONFIGURATION = Symbol('BETTER_AUTH_CONFIGURATION')

const MINIMUM_SECRET_LENGTH = 32
const HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/
const ADDRESS_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+$/
const NAMED_ADDRESS_PATTERN = /^[^<>"\r\n]*<([^\s@<>"]+@[^\s@<>"]+)>$/

export interface AuthMailTransportConfiguration {
    readonly host: string
    readonly port: number
    /** Implicit TLS from the first byte; otherwise production still requires STARTTLS. */
    readonly secure: boolean
    readonly requireTls: boolean
    readonly user?: string
    readonly password?: string
    readonly from: string
}

export interface BetterAuthConfiguration {
    readonly secret: string
    readonly baseUrl: string
    readonly databaseUrl: string
    readonly mail: AuthMailTransportConfiguration
}

/** Reads one already-resolved setting; `_FILE` variants are resolved by the caller's secret loader. */
export type ConfigurationReader = (name: string) => unknown

/**
 * Validates the runtime settings only when a process composes the runtime. Messages name the setting and the
 * failed rule, never its value, so a misconfiguration cannot print a secret or mail credential.
 */
export function createBetterAuthConfiguration(read: ConfigurationReader): BetterAuthConfiguration {
    const production = read('NODE_ENV') === 'production'
    const secret = requiredString(read, 'BETTER_AUTH_SECRET')
    if (secret.length < MINIMUM_SECRET_LENGTH) throw new Error('BETTER_AUTH_SECRET: too-short')

    const user = optionalString(read, 'AUTH_MAIL_SMTP_USER')
    const password = optionalString(read, 'AUTH_MAIL_SMTP_PASSWORD')
    if ((user === undefined) !== (password === undefined)) {
        throw new Error('AUTH_MAIL_SMTP_USER: requires AUTH_MAIL_SMTP_PASSWORD')
    }
    const secure = booleanSetting(read, 'AUTH_MAIL_SMTP_SECURE')

    return {
        secret,
        baseUrl: applicationUrl(requiredString(read, 'APP_BASE_URL'), production),
        databaseUrl: databaseUrl(requiredString(read, 'POSTGRES_URL')),
        mail: {
            host: mailHost(requiredString(read, 'AUTH_MAIL_SMTP_HOST')),
            port: portSetting(read, 'AUTH_MAIL_SMTP_PORT'),
            secure,
            requireTls: production && !secure,
            ...(user === undefined ? {} : { user, password }),
            from: senderAddress(requiredString(read, 'AUTH_MAIL_FROM')),
        },
    }
}

function requiredString(read: ConfigurationReader, name: string): string {
    const value = optionalString(read, name)
    if (value === undefined) throw new Error(`${name}: missing`)
    return value
}

function optionalString(read: ConfigurationReader, name: string): string | undefined {
    const value = read(name)
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'string') throw new Error(`${name}: invalid`)
    return value
}

function booleanSetting(read: ConfigurationReader, name: string): boolean {
    const value = read(name)
    if (value === undefined || value === '' || value === false || value === 'false') return false
    if (value === true || value === 'true') return true
    throw new Error(`${name}: invalid-boolean`)
}

function portSetting(read: ConfigurationReader, name: string): number {
    const value = read(name)
    const port = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? +value : NaN
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${name}: invalid-port`)
    return port
}

function parseUrl(value: string, name: string): URL {
    try {
        return new URL(value)
    } catch {
        throw new Error(`${name}: invalid-url`)
    }
}

function applicationUrl(value: string, production: boolean): string {
    const url = parseUrl(value, 'APP_BASE_URL')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('APP_BASE_URL: unsupported-url')
    }
    if (production && url.protocol !== 'https:') throw new Error('APP_BASE_URL: https-required')
    return url.origin
}

function databaseUrl(value: string): string {
    const url = parseUrl(value, 'POSTGRES_URL')
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('POSTGRES_URL: unsupported-url')
    return value
}

function mailHost(value: string): string {
    if (!HOST_PATTERN.test(value)) throw new Error('AUTH_MAIL_SMTP_HOST: invalid-host')
    return value
}

function senderAddress(value: string): string {
    if (!ADDRESS_PATTERN.test(value) && !NAMED_ADDRESS_PATTERN.test(value)) {
        throw new Error('AUTH_MAIL_FROM: invalid-address')
    }
    return value
}
