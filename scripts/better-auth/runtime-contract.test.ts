import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { ConsoleLogger, Logger } from '@nestjs/common'
import { Pool } from 'pg'
import { DataSource } from 'typeorm'
import {
    AuthMailDeliveryError,
    BETTER_AUTH_ENTITIES,
    BETTER_AUTH_TABLES,
    BetterAuthConfiguration,
    BetterAuthRuntime,
    betterAuthSessionCookieEffects,
    betterAuthSessionCookieName,
    openBetterAuthRuntime,
} from '@tuposoft/lead-email-finder/better-auth'
import {
    createNodemailerTransport,
    SmtpAuthMailDelivery,
} from '../../src/libs/better-auth/src/mail/smtp-auth-mail-delivery'
import { loadBetterAuthLibrary } from '../../src/libs/better-auth/src/native/better-auth-library'

// Executed by `corepack pnpm test:auth-runtime` as compiled CommonJS under `node --test`; Jest cannot load the
// ESM-only package, so this suite is the evidence that the real library works in the application's module format.

const PINNED_VERSION = '1.7.11'
const MAGIC_LINK_SOURCE = { method: 'magic-link' } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const checkoutRoot = realpathSync(resolve(__dirname, '../../../..'))
const postgresUrl = requiredEnvironment('TEST_BETTER_AUTH_POSTGRES_URL')
const mailHttpUrl = requiredEnvironment('TEST_AUTH_MAIL_HTTP_URL')
const mailSmtpPort = Number(requiredEnvironment('TEST_AUTH_MAIL_SMTP_PORT'))
const schema = `auth_contract_${randomBytes(6).toString('hex')}`
const secret = randomBytes(32).toString('base64url')
const configuration: BetterAuthConfiguration = {
    secret,
    baseUrl: 'http://localhost:53000',
    databaseUrl: postgresUrl,
    mail: {
        host: '127.0.0.1',
        port: mailSmtpPort,
        secure: false,
        requireTls: false,
        from: 'Lead Email Finder <no-reply@lef.test>',
    },
}

let admin: Pool

function requiredEnvironment(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is required; run corepack pnpm test:auth-runtime`)
    return value
}

function scopedPool(): Pool {
    return new Pool({ connectionString: postgresUrl, max: 3, options: `-c search_path=${schema}` })
}

async function synchronize(): Promise<void> {
    const dataSource = new DataSource({
        type: 'postgres',
        url: postgresUrl,
        schema,
        entities: BETTER_AUTH_ENTITIES,
        synchronize: true,
    })
    await dataSource.initialize()
    await dataSource.destroy()
}

async function open(): Promise<{ runtime: BetterAuthRuntime; pool: Pool }> {
    const pool = scopedPool()
    return { runtime: await openBetterAuthRuntime(configuration, { pool }), pool }
}

async function withRuntime<T>(work: (runtime: BetterAuthRuntime) => Promise<T>): Promise<T> {
    const { runtime } = await open()
    try {
        return await work(runtime)
    } finally {
        await runtime.close()
    }
}

function uniqueEmail(label: string): string {
    return `contract-${label}-${randomBytes(4).toString('hex')}@lef.test`
}

// The test runner reports through stdout, so capture the application's log sinks rather than the stream itself:
// the Nest logger used for native diagnostics and every console method a dependency could reach.
async function captureOutput<T>(work: () => Promise<T>): Promise<{ result: T; output: string }> {
    const chunks: string[] = []
    const record = (...values: unknown[]): void => {
        chunks.push(values.map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '))
    }
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
    const originals = methods.map(method => console[method])
    for (const method of methods) console[method] = record
    Logger.overrideLogger({ log: record, error: record, warn: record, debug: record, verbose: record, fatal: record })
    try {
        return { result: await work(), output: chunks.join('\n') }
    } finally {
        methods.forEach((method, index) => (console[method] = originals[index]))
        Logger.overrideLogger(new ConsoleLogger())
    }
}

interface MailpitSummary {
    ID: string
}

async function mailpit<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, mailHttpUrl), { ...init, signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true, `Mailpit request failed with ${response.status}`)
    return (await response.json()) as T
}

async function waitForMessage(recipient: string): Promise<{ id: string; text: string }> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const { messages } = await mailpit<{ messages: MailpitSummary[] }>(
            `/api/v1/search?query=${encodeURIComponent(`to:"${recipient}"`)}`,
        )
        if (messages.length === 1) {
            const { Text } = await mailpit<{ Text: string }>(`/api/v1/message/${messages[0].ID}`)
            return { id: messages[0].ID, text: Text }
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
    }
    throw new Error('The authentication message did not reach Mailpit')
}

async function closedPort(): Promise<number> {
    const server = createServer()
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    await new Promise(resolveClose => server.close(resolveClose))
    if (!address || typeof address === 'string') throw new Error('No ephemeral port')
    return address.port
}

before(async () => {
    const database = new URL(postgresUrl).pathname.slice(1)
    if (!database.endsWith('_test')) throw new Error('TEST_BETTER_AUTH_POSTGRES_URL must select a *_test database')
    admin = new Pool({ connectionString: postgresUrl, max: 1 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    await synchronize()
})

after(async () => {
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.end()
})

void test('a compiled CommonJS process loads the pinned package and selected plugins', async () => {
    const manifest = JSON.parse(
        readFileSync(realpathSync(resolve(checkoutRoot, 'node_modules/better-auth/package.json')), 'utf8'),
    ) as { version: string }
    assert.equal(manifest.version, PINNED_VERSION)
    const library = await loadBetterAuthLibrary()
    assert.equal(typeof library.betterAuth, 'function')
    assert.equal(typeof library.magicLink, 'function')
    assert.equal(typeof library.twoFactor, 'function')
})

interface TwoFactorRow {
    id: string
    secret: string
    backupCodes: string
    userId: string
    verified: boolean
}

interface ColumnRow {
    table_name: string
    column_name: string
    data_type: string
    is_nullable: 'YES' | 'NO'
}

interface IndexRow {
    table_name: string
    column_name: string
    is_unique: boolean
}

interface ForeignKeyRow {
    table_name: string
    column_name: string
    referenced_table: string
    delete_rule: string
}

const POSTGRES_TYPES: Record<string, string> = {
    string: 'text',
    boolean: 'boolean',
    date: 'timestamp with time zone',
    number: 'integer',
}

void test('TypeORM synchronization matches every installed core and TOTP table', async () => {
    await withRuntime(async runtime => {
        const { getAuthTables } = await import('better-auth/db')
        const tables = getAuthTables(runtime.auth.options)
        assert.deepEqual(Object.keys(tables).sort(), Object.keys(BETTER_AUTH_TABLES).sort())

        const { rows: columns } = await admin.query<ColumnRow>(
            `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1`,
            [schema],
        )
        const { rows: indexes } = await admin.query<IndexRow>(
            `SELECT t.relname AS table_name, a.attname AS column_name, ix.indisunique AS is_unique
             FROM pg_index ix
             JOIN pg_class t ON t.oid = ix.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[0]
             WHERE n.nspname = $1 AND NOT ix.indisprimary AND ix.indnatts = 1`,
            [schema],
        )
        const { rows: foreignKeys } = await admin.query<ForeignKeyRow>(
            `SELECT kcu.table_name, kcu.column_name, ccu.table_name AS referenced_table, rc.delete_rule
             FROM information_schema.referential_constraints rc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = rc.constraint_name AND ccu.constraint_schema = rc.constraint_schema
             WHERE rc.constraint_schema = $1`,
            [schema],
        )

        for (const [model, table] of Object.entries(tables)) {
            const tableName = table.modelName
            assert.equal(tableName, BETTER_AUTH_TABLES[model as keyof typeof BETTER_AUTH_TABLES])
            const tableColumns = columns.filter(column => column.table_name === tableName)
            const id = tableColumns.find(column => column.column_name === 'id')
            assert.equal(id?.data_type, 'uuid', `${tableName}.id`)
            const expected = new Set(['id'])

            for (const [field, attribute] of Object.entries(table.fields)) {
                const columnName = attribute.fieldName ?? field
                expected.add(columnName)
                const column = tableColumns.find(candidate => candidate.column_name === columnName)
                assert.ok(column, `${tableName}.${columnName} exists`)
                const type = attribute.references ? 'uuid' : POSTGRES_TYPES[String(attribute.type)]
                assert.equal(column.data_type, type, `${tableName}.${columnName} type`)
                assert.equal(
                    column.is_nullable,
                    attribute.required === false ? 'YES' : 'NO',
                    `${tableName}.${columnName} null`,
                )
                const columnIndexes = indexes.filter(
                    index => index.table_name === tableName && index.column_name === columnName,
                )
                if (attribute.unique) {
                    assert.ok(
                        columnIndexes.some(index => index.is_unique),
                        `${tableName}.${columnName} unique`,
                    )
                }
                if (attribute.index) assert.ok(columnIndexes.length > 0, `${tableName}.${columnName} indexed`)
                if (attribute.references) {
                    const foreignKey: ForeignKeyRow | undefined = foreignKeys.find(
                        key => key.table_name === tableName && key.column_name === columnName,
                    )
                    assert.equal(foreignKey?.referenced_table, BETTER_AUTH_TABLES.user)
                    assert.equal(
                        foreignKey?.delete_rule,
                        (attribute.references.onDelete ?? 'no action').toUpperCase(),
                        `${tableName}.${columnName} delete rule`,
                    )
                }
            }
            assert.deepEqual(
                tableColumns.map(column => column.column_name).sort(),
                [...expected].sort(),
                `${tableName} has no unmapped columns`,
            )
        }
    })
})

void test('native operations create and read users, sessions, verifications, and TOTP enrollments', async () => {
    await withRuntime(async runtime => {
        const context = await runtime.auth.$context
        const email = uniqueEmail('native')
        const user = await context.internalAdapter.createUser(
            { email, name: 'Contract User', emailVerified: false },
            MAGIC_LINK_SOURCE,
        )
        assert.match(user.id, UUID)
        assert.equal((await context.internalAdapter.findUserByEmail(email))?.user.id, user.id)

        const session = await context.internalAdapter.createSession(user.id)
        assert.equal((await context.internalAdapter.findSession(session.token))?.user.id, user.id)

        const identifier = `contract-${randomBytes(6).toString('hex')}`
        const expiresAt = new Date(Date.now() + 60_000)
        await context.internalAdapter.createVerificationValue({ identifier, value: 'contract-value', expiresAt })
        assert.equal((await context.internalAdapter.findVerificationValue(identifier))?.value, 'contract-value')

        const enrollment = await context.adapter.create<TwoFactorRow>({
            model: 'twoFactor',
            data: { secret: 'encrypted-secret', backupCodes: 'encrypted-codes', userId: user.id, verified: true },
        })
        assert.match(enrollment.id, UUID)
        const { rows } = await admin.query<{ user_id: string; failed_verification_count: number }>(
            `SELECT user_id, failed_verification_count FROM ${schema}.better_auth_two_factors WHERE id = $1`,
            [enrollment.id],
        )
        assert.deepEqual(rows, [{ user_id: user.id, failed_verification_count: 0 }])
    })
})

void test('a duplicate native email is rejected while provisioning reuses the existing identity', async () => {
    await withRuntime(async runtime => {
        const context = await runtime.auth.$context
        const email = uniqueEmail('duplicate')
        const provisioned = await runtime.provisioner.ensureUnverifiedByEmail(email.toUpperCase())
        assert.equal(provisioned.created, true)
        assert.equal(provisioned.emailVerified, false)

        await assert.rejects(
            context.internalAdapter.createUser({ email, name: 'Duplicate', emailVerified: true }, MAGIC_LINK_SOURCE),
        )
        const again = await runtime.provisioner.ensureUnverifiedByEmail(email)
        assert.deepEqual(again, { ...provisioned, created: false })

        const accounts = await admin.query(`SELECT 1 FROM ${schema}.better_auth_accounts WHERE user_id = $1`, [
            provisioned.id,
        ])
        assert.equal(accounts.rowCount, 0)
    })
})

void test('repeat initialization keeps existing users and enrollments and creates no migration state', async () => {
    const email = uniqueEmail('repeat')
    const { userId, enrollmentId } = await withRuntime(async runtime => {
        const context = await runtime.auth.$context
        const user = await context.internalAdapter.createUser(
            { email, name: 'Repeat', emailVerified: true },
            MAGIC_LINK_SOURCE,
        )
        const enrollment = await context.adapter.create<TwoFactorRow>({
            model: 'twoFactor',
            data: { secret: 'encrypted-secret', backupCodes: 'encrypted-codes', userId: user.id, verified: true },
        })
        return { userId: user.id, enrollmentId: enrollment.id }
    })

    await synchronize()

    await withRuntime(async runtime => {
        const context = await runtime.auth.$context
        assert.equal((await context.internalAdapter.findUserByEmail(email))?.user.id, userId)
        const enrollment = await context.adapter.findOne<{ id: string }>({
            model: 'twoFactor',
            where: [{ field: 'userId', value: userId }],
        })
        assert.equal(enrollment?.id, enrollmentId)
    })
    const migrations = await admin.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name NOT LIKE 'better_auth_%'`,
        [schema],
    )
    assert.equal(migrations.rowCount, 0)
})

void test('a magic link reaches the authentication Mailpit service without logging secrets', async () => {
    await withRuntime(async runtime => {
        const email = uniqueEmail('magic')
        await runtime.provisioner.ensureUnverifiedByEmail(email)
        const { output } = await captureOutput(() =>
            runtime.auth.api.signInMagicLink({ body: { email, callbackURL: '/app' }, headers: new Headers() }),
        )

        const message = await waitForMessage(email)
        const link = /http:\/\/localhost:53000\/api\/auth\/magic-link\/verify\?token=([A-Za-z0-9_-]+)/.exec(
            message.text,
        )
        assert.ok(link, 'the message contains a native verification link')
        const token = link[1]
        const stored = await admin.query<{ identifier: string }>(
            `SELECT identifier FROM ${schema}.better_auth_verifications WHERE identifier = $1`,
            [token],
        )
        assert.equal(stored.rowCount, 0, 'the database stores only a hashed token')
        for (const secretValue of [email, token, secret]) assert.equal(output.includes(secretValue), false)

        const verified = await runtime.auth.api.magicLinkVerify({
            query: { token },
            headers: new Headers(),
            asResponse: true,
        })
        assert.equal(verified.status, 200)
        const cookieName = betterAuthSessionCookieName(configuration.baseUrl)
        const sessionCookie = verified.headers.getSetCookie().find(cookie => cookie.startsWith(`${cookieName}=`))
        assert.ok(sessionCookie, 'Better Auth verification issues the configured session cookie')
        assert.equal(sessionCookie.includes('HttpOnly'), true)
        assert.equal(sessionCookie.includes('SameSite=Lax'), true)
        assert.equal(sessionCookie.includes('Path=/'), true)
        const headers = new Headers({ cookie: sessionCookie.split(';', 1)[0] })
        const sessionValue = (await verified.json()) as { session: { id: string; token: string } }
        await admin.query(
            `UPDATE ${schema}.better_auth_sessions SET expires_at = NOW() + INTERVAL '1 hour' WHERE id = $1`,
            [sessionValue.session.id],
        )

        let renewalCookies: readonly string[] = []
        await betterAuthSessionCookieEffects.run(
            async () => {
                const current = await runtime.auth.api.getSession({
                    headers,
                    query: { disableCookieCache: true },
                    asResponse: true,
                })
                betterAuthSessionCookieEffects.capture(current.headers)
                assert.equal(current.status, 200)
                const value = (await current.json()) as { user: { emailVerified: boolean } }
                assert.equal(value.user.emailVerified, true)
            },
            cookies => {
                renewalCookies = cookies
            },
        )
        assert.equal(
            renewalCookies.some(cookie => cookie.startsWith(`${cookieName}=`)),
            true,
        )

        await (await runtime.auth.$context).internalAdapter.deleteSession(sessionValue.session.token)
        const revoked = await runtime.auth.api.getSession({
            headers,
            query: { disableCookieCache: true },
            asResponse: true,
        })
        assert.equal(await revoked.json(), null)
        assert.equal(
            revoked.headers.getSetCookie().some(cookie => cookie.startsWith(`${cookieName}=`)),
            true,
        )

        const deleted = await fetch(new URL('/api/v1/messages', mailHttpUrl), {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ IDs: [message.id] }),
            signal: AbortSignal.timeout(5_000),
        })
        assert.equal(deleted.ok, true)
    })
})

void test('SMTP rejection and connection failure propagate as redacted delivery errors', async () => {
    await withRuntime(async runtime => {
        const rejectedRecipient = `contract-${randomBytes(4).toString('hex')}@rejected.test`
        const { result: rejected, output } = await captureOutput(() =>
            runtime.mailDelivery.send({ to: rejectedRecipient, subject: 'Contract', text: 'secret-link-value' }).then(
                () => undefined,
                (error: unknown) => error,
            ),
        )
        assert.ok(rejected instanceof AuthMailDeliveryError)
        assert.equal(rejected.reason, 'rejected')
        assert.equal(rejected.message.includes(rejectedRecipient), false)
        assert.equal(output.includes(rejectedRecipient) || output.includes('secret-link-value'), false)
    })

    const port = await closedPort()
    const delivery = new SmtpAuthMailDelivery(
        createNodemailerTransport({ ...configuration.mail, host: '127.0.0.1', port }),
        configuration.mail.from,
    )
    try {
        await assert.rejects(
            delivery.send({ to: 'person@lef.test', subject: 'Contract', text: 'secret-link-value' }),
            (error: unknown) => error instanceof AuthMailDeliveryError && error.reason === 'unavailable',
        )
    } finally {
        delivery.close()
    }
})

void test('closing the runtime releases its PostgreSQL pool', async () => {
    const { runtime, pool } = await open()
    await (await runtime.auth.$context).internalAdapter.findUserByEmail(uniqueEmail('shutdown'))
    await runtime.close()
    assert.equal(pool.totalCount, 0)
    await assert.rejects(pool.query('SELECT 1'))
})
