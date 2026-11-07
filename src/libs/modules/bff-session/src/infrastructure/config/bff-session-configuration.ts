import { ConfigService } from '@nestjs/config'
import { BffSessionConfiguration, BrowserSessionConfiguration } from '../../application/bff-session-configuration'

const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000
const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000

function normalizeProviderUrl(value: unknown, key: string, realmBase: boolean): string {
    const invalid = (): Error =>
        new Error(`${key} must be an absolute HTTP(S) URL without credentials, whitespace, query, or fragment`)

    if (typeof value !== 'string' || !/^https?:\/\/[^/]/i.test(value) || /[\s\\?#]/.test(value)) {
        throw invalid()
    }

    let url: URL
    try {
        url = new URL(value)
    } catch {
        // URL parsing errors may contain the supplied value, including accidental credentials.
        throw invalid()
    }

    if (!url.hostname || url.username || url.password) {
        throw invalid()
    }

    return realmBase ? url.toString().replace(/\/+$/, '') : url.toString()
}

export function createBffSessionConfiguration(configService: ConfigService): BffSessionConfiguration {
    const appBaseUrl = configService.getOrThrow<string>('APP_BASE_URL')
    const issuer = normalizeProviderUrl(configService.getOrThrow<string>('OIDC_ISSUER_URL'), 'OIDC_ISSUER_URL', true)
    const configuredBackchannelUrl = configService.get<string>('OIDC_BACKCHANNEL_URL')
    const backchannelUrl =
        configuredBackchannelUrl === undefined
            ? issuer
            : normalizeProviderUrl(configuredBackchannelUrl, 'OIDC_BACKCHANNEL_URL', true)
    const configuredJwksUri = configService.get<string>('OIDC_JWKS_URI')
    const jwksUri =
        configuredJwksUri === undefined
            ? `${issuer}/protocol/openid-connect/certs`
            : normalizeProviderUrl(configuredJwksUri, 'OIDC_JWKS_URI', false)
    const clientId = configService.getOrThrow<string>('BFF_CLIENT_ID')
    const clientSecret = configService.getOrThrow<string>('BFF_CLIENT_SECRET')
    const sessionIdleTimeoutMs = configService.get<number>('SESSION_IDLE_TIMEOUT_MS') ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS
    const sessionAbsoluteTimeoutMs =
        configService.get<number>('SESSION_ABSOLUTE_TIMEOUT_MS') ?? DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS

    return {
        appBaseUrl,
        issuer,
        backchannelUrl,
        jwksUri,
        clientId,
        clientSecret,
        sessionIdleTimeoutMs,
        sessionAbsoluteTimeoutMs,
        isSecureCookie: new URL(appBaseUrl).protocol === 'https:',
    }
}

/** Native browser composition does not read or require any OIDC settings. */
export function createNativeBrowserSessionConfiguration(configService: ConfigService): BrowserSessionConfiguration {
    const appBaseUrl = normalizeProviderUrl(configService.getOrThrow<string>('APP_BASE_URL'), 'APP_BASE_URL', true)
    const duration = (key: string, fallback: number): number => {
        const configured = configService.get<unknown>(key)
        const value = configured === undefined ? fallback : Number(configured)
        if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`)
        return value
    }
    return {
        appBaseUrl,
        sessionIdleTimeoutMs: duration('SESSION_IDLE_TIMEOUT_MS', DEFAULT_SESSION_IDLE_TIMEOUT_MS),
        sessionAbsoluteTimeoutMs: duration('SESSION_ABSOLUTE_TIMEOUT_MS', DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS),
        isSecureCookie: new URL(appBaseUrl).protocol === 'https:',
    }
}
