import type { Pool } from 'pg'
import { BetterAuthConfiguration } from '../better-auth-configuration'
import { AuthMailDelivery } from '../mail/auth-mail-delivery'
import { BETTER_AUTH_TABLES } from '../persistence/better-auth-schema'
import { BetterAuthLibrary } from './better-auth-library'
import { createBetterAuth, BetterAuthInstanceOptions } from './create-better-auth'

const configuration: BetterAuthConfiguration = {
    secret: 'synthetic-secret-value-that-is-long-enough',
    baseUrl: 'http://localhost:53000',
    databaseUrl: 'postgresql://postgres:synthetic@localhost:55432/lef',
    mail: { host: 'auth-mail', port: 1025, secure: false, requireTls: false, from: 'no-reply@lef.test' },
}

interface Composition {
    pool: Pool
    mailDelivery: jest.Mocked<AuthMailDelivery>
    logger: { error: jest.Mock; warn: jest.Mock }
    magicLink: jest.Mock<unknown, [unknown]>
    twoFactor: jest.Mock<unknown, [unknown]>
    betterAuth: jest.Mock<unknown, [unknown]>
    options: BetterAuthInstanceOptions
}

function compose(baseUrl = configuration.baseUrl): Composition {
    const pool = {} as Pool
    const mailDelivery: jest.Mocked<AuthMailDelivery> = { send: jest.fn().mockResolvedValue(undefined) }
    const logger = { error: jest.fn(), warn: jest.fn() }
    const magicLink = jest.fn((options: unknown) => ({ id: 'magic-link', options }))
    const twoFactor = jest.fn((options: unknown) => ({ id: 'two-factor', options }))
    const betterAuth = jest.fn((options: unknown) => ({ options }))
    const library = { betterAuth, magicLink, twoFactor } as unknown as BetterAuthLibrary
    createBetterAuth(library, { configuration: { ...configuration, baseUrl }, pool, mailDelivery, logger })
    const options = betterAuth.mock.calls[0][0] as BetterAuthInstanceOptions
    return { pool, mailDelivery, logger, magicLink, twoFactor, betterAuth, options }
}

type MagicLinkOptions = Parameters<BetterAuthLibrary['magicLink']>[0]
type TwoFactorOptions = Parameters<BetterAuthLibrary['twoFactor']>[0]

describe('createBetterAuth', () => {
    it('constructs exactly one Better Auth instance on the owned pool with database-only sessions', () => {
        const { betterAuth, options, pool } = compose()

        expect(betterAuth).toHaveBeenCalledTimes(1)
        expect(options).toMatchObject({
            baseURL: 'http://localhost:53000',
            secret: configuration.secret,
            trustedOrigins: ['http://localhost:53000'],
            database: pool,
            telemetry: { enabled: false },
            emailAndPassword: { enabled: false },
            advanced: { database: { generateId: 'uuid' }, useSecureCookies: false },
            session: { cookieCache: { enabled: false } },
        })
        expect(options.secondaryStorage).toBeUndefined()
        expect(compose('https://app.example.test').options.advanced?.useSecureCookies).toBe(true)
    })

    it('maps every core model to its better_auth_* table with snake_case columns', () => {
        const { options } = compose()

        expect(options.user).toEqual({
            modelName: BETTER_AUTH_TABLES.user,
            fields: {
                name: 'name',
                email: 'email',
                emailVerified: 'email_verified',
                image: 'image',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
            },
        })
        expect(options.session?.modelName).toBe(BETTER_AUTH_TABLES.session)
        expect(options.session?.fields).toMatchObject({ userId: 'user_id', expiresAt: 'expires_at' })
        expect(options.account).toMatchObject({ modelName: BETTER_AUTH_TABLES.account, fields: { userId: 'user_id' } })
        expect(options.verification).toMatchObject({
            modelName: BETTER_AUTH_TABLES.verification,
            fields: { expiresAt: 'expires_at' },
        })
    })

    it('configures the BFF session cookie with the Better Auth HTTP and HTTPS scope', () => {
        expect(compose().options.advanced?.cookies?.session_token).toEqual({
            name: 'lef_session',
            attributes: { httpOnly: true, sameSite: 'lax', path: '/' },
        })
        expect(compose('https://app.example.test').options.advanced).toMatchObject({
            useSecureCookies: true,
            cookies: { session_token: { name: 'lef_session' } },
        })
    })

    it('selects magic links with registration disabled and passwordless TOTP on mapped tables', () => {
        const { magicLink, twoFactor } = compose()

        expect(magicLink.mock.calls[0][0]).toMatchObject({ disableSignUp: true, storeToken: 'hashed', expiresIn: 300 })
        expect(twoFactor.mock.calls[0][0] as TwoFactorOptions).toMatchObject({
            allowPasswordless: true,
            schema: {
                user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
                twoFactor: {
                    modelName: BETTER_AUTH_TABLES.twoFactor,
                    fields: { backupCodes: 'backup_codes', failedVerificationCount: 'failed_verification_count' },
                },
            },
        })
    })

    it('delivers magic links through the authentication mail capability', async () => {
        const { magicLink, mailDelivery } = compose()
        const { sendMagicLink } = magicLink.mock.calls[0][0] as MagicLinkOptions

        await sendMagicLink({ email: 'person@lef.test', url: 'http://localhost:53000/link', token: 'synthetic' })

        expect(mailDelivery.send).toHaveBeenCalledWith({
            to: 'person@lef.test',
            subject: 'Your Lead Email Finder sign-in link',
            text: expect.stringContaining('http://localhost:53000/link') as string,
        })
    })

    it('propagates mail failures to the native caller', async () => {
        const { magicLink, mailDelivery } = compose()
        mailDelivery.send.mockRejectedValue(new Error('Authentication mail delivery failed: unavailable'))
        const { sendMagicLink } = magicLink.mock.calls[0][0] as MagicLinkOptions

        await expect(
            sendMagicLink({ email: 'person@lef.test', url: 'http://localhost:53000/link', token: 'synthetic' }),
        ).rejects.toThrow('unavailable')
    })

    it('redacts native log messages and drops their structured arguments', () => {
        const { options, logger } = compose()
        const log = options.logger?.log
        log?.('error', 'Invalid redirect URL: http://localhost:53000/?token=secret', { email: 'person@lef.test' })
        log?.('warn', 'Rate limited person@lef.test')

        expect(logger.error).toHaveBeenCalledWith('Invalid redirect URL: [url]')
        expect(logger.warn).toHaveBeenCalledWith('Rate limited [email]')
    })
})
