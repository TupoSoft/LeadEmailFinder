import { NativeHumanUser } from '@tuposoft/lead-email-finder/better-auth'

export const NATIVE_FIXTURES = [
    { fixture: 'owner', email: 'native-owner@lef.test', name: 'Native Owner' },
    { fixture: 'admin', email: 'native-admin@lef.test', name: 'Native Admin' },
    { fixture: 'member', email: 'native-member@lef.test', name: 'Native Member' },
    { fixture: 'platform-operator', email: 'native-operator@lef.test', name: 'Native Platform Operator' },
] as const

export type NativeFixtureName = (typeof NATIVE_FIXTURES)[number]['fixture']

export interface NativeFixtureUser {
    readonly fixture: NativeFixtureName
    readonly email: string
    readonly nativeUserId: string
    readonly externalIdentityId: string
}

/** Written to `.dev/auth/native-users.json` (0600): identifiers and fixture addresses, never credentials. */
export interface NativeFixtureMetadata {
    readonly version: 1
    readonly checkoutRoot: string
    readonly composeProject: string
    readonly issuer: string
    readonly users: readonly NativeFixtureUser[]
}

export type SqlQuery = <Row extends object>(text: string, values: unknown[]) => Promise<Row[]>

export interface NativeFixtureSeedDependencies {
    readonly ensureUnverifiedByEmail: (email: string) => Promise<NativeHumanUser>
    /** Reads through the native runtime, proving the mapped tables agree with Better Auth. */
    readonly readNativeUser: (email: string) => Promise<{ id: string; emailVerified: boolean } | undefined>
    readonly query: SqlQuery
}

export interface NativeFixtureSeedInput {
    readonly checkoutRoot: string
    readonly composeProject: string
    readonly issuer: string
    readonly previous?: NativeFixtureMetadata
}

export class NativeFixtureSeedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = NativeFixtureSeedError.name
    }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function parseNativeFixtureMetadata(
    value: unknown,
    checkoutRoot: string,
    composeProject: string,
    issuer: string,
): NativeFixtureMetadata {
    const metadata = value as Partial<NativeFixtureMetadata> | null
    if (
        !metadata ||
        metadata.version !== 1 ||
        metadata.checkoutRoot !== checkoutRoot ||
        metadata.composeProject !== composeProject ||
        metadata.issuer !== issuer ||
        !Array.isArray(metadata.users)
    ) {
        throw new NativeFixtureSeedError(
            'Native fixture metadata belongs to another checkout or stack; no data changed',
        )
    }
    const fixtures = new Map<string, string>(NATIVE_FIXTURES.map(({ fixture, email }) => [fixture, email]))
    const seen = new Set<string>()
    for (const user of metadata.users as Partial<NativeFixtureUser>[]) {
        if (
            typeof user?.fixture !== 'string' ||
            fixtures.get(user.fixture) !== user.email ||
            seen.has(user.fixture) ||
            !UUID.test(String(user.nativeUserId)) ||
            !UUID.test(String(user.externalIdentityId))
        ) {
            throw new NativeFixtureSeedError('Native fixture metadata is malformed or ambiguous; no data changed')
        }
        seen.add(user.fixture)
    }
    return metadata as NativeFixtureMetadata
}

/**
 * Idempotently creates the native owner, admin, member, and platform-operator fixtures and links each to a local
 * external identity under the native issuer. It grants no membership, role, or credit and never touches TOTP
 * enrollment, so reruns keep identifiers and enrolled factors stable.
 */
export async function seedNativeFixtures(
    dependencies: NativeFixtureSeedDependencies,
    input: NativeFixtureSeedInput,
): Promise<NativeFixtureMetadata> {
    const users: NativeFixtureUser[] = []
    for (const { fixture, email, name } of NATIVE_FIXTURES) {
        const recorded = input.previous?.users.find(user => user.fixture === fixture)
        const user = await dependencies.ensureUnverifiedByEmail(email)
        if (recorded && recorded.nativeUserId !== user.id) {
            throw new NativeFixtureSeedError(`Native ${fixture} fixture no longer matches its recorded identity`)
        }
        await markFixtureVerified(dependencies.query, user.id, name)
        const externalIdentityId = await linkExternalIdentity(dependencies.query, input.issuer, user.id, email)
        if (recorded && recorded.externalIdentityId !== externalIdentityId) {
            throw new NativeFixtureSeedError(
                `Native ${fixture} fixture no longer matches its recorded external identity`,
            )
        }
        const native = await dependencies.readNativeUser(email)
        if (native?.id !== user.id || !native.emailVerified) {
            throw new NativeFixtureSeedError(`Native ${fixture} fixture is not readable through the native runtime`)
        }
        users.push({ fixture, email, nativeUserId: user.id, externalIdentityId })
    }
    return {
        version: 1,
        checkoutRoot: input.checkoutRoot,
        composeProject: input.composeProject,
        issuer: input.issuer,
        users,
    }
}

// Fixture-only: production provisioning never marks an address verified without a completed magic link.
async function markFixtureVerified(query: SqlQuery, id: string, name: string): Promise<void> {
    await query(
        `UPDATE better_auth_users
         SET email_verified = true, name = $2, updated_at = now()
         WHERE id = $1 AND (email_verified = false OR name <> $2)`,
        [id, name],
    )
}

async function linkExternalIdentity(query: SqlQuery, issuer: string, subject: string, email: string): Promise<string> {
    const conflicting = await query<{ id: string }>(
        `SELECT id FROM external_identities WHERE issuer = $1 AND lower(email) = $2 AND subject <> $3`,
        [issuer, email, subject],
    )
    if (conflicting.length > 0) {
        throw new NativeFixtureSeedError('Another native external identity already uses a fixture address')
    }
    const [row] = await query<{ id: string }>(
        `INSERT INTO external_identities (issuer, subject, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (issuer, subject) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [issuer, subject, email],
    )
    return row.id
}
