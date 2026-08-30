import { ConfigService } from '@nestjs/config'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'

const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000
const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000

export function createBffSessionConfiguration(configService: ConfigService): BffSessionConfiguration {
    const appBaseUrl = configService.getOrThrow<string>('APP_BASE_URL')
    const issuer = configService.getOrThrow<string>('OIDC_ISSUER_URL')
    const clientId = configService.getOrThrow<string>('BFF_CLIENT_ID')
    const clientSecret = configService.getOrThrow<string>('BFF_CLIENT_SECRET')
    const sessionIdleTimeoutMs = configService.get<number>('SESSION_IDLE_TIMEOUT_MS') ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS
    const sessionAbsoluteTimeoutMs =
        configService.get<number>('SESSION_ABSOLUTE_TIMEOUT_MS') ?? DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS

    return {
        appBaseUrl,
        issuer,
        clientId,
        clientSecret,
        sessionIdleTimeoutMs,
        sessionAbsoluteTimeoutMs,
        isSecureCookie: new URL(appBaseUrl).protocol === 'https:',
    }
}
