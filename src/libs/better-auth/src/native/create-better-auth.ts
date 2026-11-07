import { Logger } from '@nestjs/common'
import type { Auth, BetterAuthOptions } from 'better-auth'
import type { Pool } from 'pg'
import { BetterAuthConfiguration } from '../better-auth-configuration'
import { AuthMailDelivery } from '../mail/auth-mail-delivery'
import { createMagicLinkMessage, MAGIC_LINK_LIFETIME_SECONDS } from '../mail/magic-link-message'
import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from '../persistence/better-auth-schema'
import { BetterAuthLibrary } from './better-auth-library'
import { redactNativeLogMessage } from './redact-native-log-message'

export const BETTER_AUTH_APP_NAME = 'Lead Email Finder'

export interface BetterAuthDependencies {
    readonly configuration: BetterAuthConfiguration
    readonly pool: Pool
    readonly mailDelivery: AuthMailDelivery
    readonly logger?: Pick<Logger, 'error' | 'warn'>
}

/**
 * Builds the one Better Auth instance. No HTTP handler is mounted: later API adapters call its server API. Sessions
 * live only in PostgreSQL (no secondary storage or cookie cache), and passwords and sign-up are disabled.
 */
export function createBetterAuth(library: BetterAuthLibrary, dependencies: BetterAuthDependencies): BetterAuthInstance {
    const { configuration, pool, mailDelivery } = dependencies
    const logger = dependencies.logger ?? new Logger('BetterAuth')

    const options: BetterAuthInstanceOptions = {
        appName: BETTER_AUTH_APP_NAME,
        baseURL: configuration.baseUrl,
        secret: configuration.secret,
        trustedOrigins: [configuration.baseUrl],
        database: pool,
        telemetry: { enabled: false },
        logger: {
            level: 'warn',
            log: (level, message) => {
                const safe = redactNativeLogMessage(message)
                if (level === 'error') logger.error(safe)
                else logger.warn(safe)
            },
        },
        advanced: {
            database: { generateId: 'uuid' },
            useSecureCookies: configuration.baseUrl.startsWith('https:'),
            cookies: {
                session_token: {
                    name: 'lef_session',
                    attributes: { httpOnly: true, sameSite: 'lax', path: '/' },
                },
            },
        },
        emailAndPassword: { enabled: false },
        user: { modelName: BETTER_AUTH_TABLES.user, fields: withoutTwoFactor(BETTER_AUTH_COLUMNS.user) },
        session: {
            modelName: BETTER_AUTH_TABLES.session,
            fields: BETTER_AUTH_COLUMNS.session,
            cookieCache: { enabled: false },
        },
        account: { modelName: BETTER_AUTH_TABLES.account, fields: BETTER_AUTH_COLUMNS.account },
        verification: { modelName: BETTER_AUTH_TABLES.verification, fields: BETTER_AUTH_COLUMNS.verification },
        plugins: [
            library.magicLink({
                // Registration is enabled only by the explicit onboarding plan.
                disableSignUp: true,
                expiresIn: MAGIC_LINK_LIFETIME_SECONDS,
                storeToken: 'hashed',
                sendMagicLink: ({ email, url }) => mailDelivery.send(createMagicLinkMessage(email, url)),
            }),
            library.twoFactor({
                issuer: BETTER_AUTH_APP_NAME,
                allowPasswordless: true,
                schema: {
                    user: { fields: { twoFactorEnabled: BETTER_AUTH_COLUMNS.user.twoFactorEnabled } },
                    twoFactor: { modelName: BETTER_AUTH_TABLES.twoFactor, fields: BETTER_AUTH_COLUMNS.twoFactor },
                },
            }),
        ],
    }

    return library.betterAuth(options)
}

export type BetterAuthInstanceOptions = BetterAuthOptions & {
    plugins: [ReturnType<BetterAuthLibrary['magicLink']>, ReturnType<BetterAuthLibrary['twoFactor']>]
}

/** The Better Auth instance with the selected plugins' server API types. */
export type BetterAuthInstance = Auth<BetterAuthInstanceOptions>

function withoutTwoFactor({
    twoFactorEnabled: _plugin,
    ...core
}: typeof BETTER_AUTH_COLUMNS.user): Omit<typeof BETTER_AUTH_COLUMNS.user, 'twoFactorEnabled'> {
    return core
}
