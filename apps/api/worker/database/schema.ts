import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('better_auth_users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const session = sqliteTable(
    'better_auth_sessions',
    {
        id: text('id').primaryKey(),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        token: text('token').notNull().unique(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    table => [index('better_auth_sessions_user_id_idx').on(table.userId)],
)

export const account = sqliteTable(
    'better_auth_accounts',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
        refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
        scope: text('scope'),
        password: text('password'),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    table => [
        index('better_auth_accounts_user_id_idx').on(table.userId),
        uniqueIndex('better_auth_accounts_provider_account_uidx').on(table.providerId, table.accountId),
    ],
)

export const verification = sqliteTable(
    'better_auth_verifications',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    },
    table => [index('better_auth_verifications_identifier_idx').on(table.identifier)],
)

export const twoFactor = sqliteTable(
    'better_auth_two_factors',
    {
        id: text('id').primaryKey(),
        secret: text('secret').notNull(),
        backupCodes: text('backup_codes').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        verified: integer('verified', { mode: 'boolean' }).default(true),
        failedVerificationCount: integer('failed_verification_count').default(0),
        lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    },
    table => [
        index('better_auth_two_factors_secret_idx').on(table.secret),
        uniqueIndex('better_auth_two_factors_user_id_uidx').on(table.userId),
    ],
)
