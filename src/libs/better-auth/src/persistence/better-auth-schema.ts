/**
 * The single mapping between Better Auth's logical models and this application's PostgreSQL tables. Both the
 * native options and the TypeORM entities read these names, so the runtime and schema synchronization cannot
 * drift apart silently; the compiled runtime contract test compares them with the installed package.
 */
export const BETTER_AUTH_TABLES = {
    user: 'better_auth_users',
    session: 'better_auth_sessions',
    account: 'better_auth_accounts',
    verification: 'better_auth_verifications',
    twoFactor: 'better_auth_two_factors',
} as const

export const BETTER_AUTH_COLUMNS = {
    user: {
        name: 'name',
        email: 'email',
        emailVerified: 'email_verified',
        image: 'image',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        twoFactorEnabled: 'two_factor_enabled',
    },
    session: {
        expiresAt: 'expires_at',
        token: 'token',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
    },
    account: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        scope: 'scope',
        password: 'password',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
    verification: {
        identifier: 'identifier',
        value: 'value',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
    twoFactor: {
        secret: 'secret',
        backupCodes: 'backup_codes',
        userId: 'user_id',
        verified: 'verified',
        failedVerificationCount: 'failed_verification_count',
        lockedUntil: 'locked_until',
    },
} as const

export type BetterAuthModel = keyof typeof BETTER_AUTH_TABLES
