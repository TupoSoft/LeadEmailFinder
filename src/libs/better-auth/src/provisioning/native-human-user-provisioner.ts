import { BETTER_AUTH_COLUMNS, BETTER_AUTH_TABLES } from '../persistence/better-auth-schema'

export const NATIVE_HUMAN_USER_PROVISIONER = Symbol('NATIVE_HUMAN_USER_PROVISIONER')

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+$/
const users = BETTER_AUTH_TABLES.user
const columns = BETTER_AUTH_COLUMNS.user

/** The minimal SQL capability the provisioner needs; `pg.Pool` satisfies it. */
export interface NativeUserQueryable {
    query<Row extends object>(text: string, values: unknown[]): Promise<{ rows: Row[] }>
}

export interface NativeHumanUser {
    /** The stable native subject linked under `AUTH_IDENTITY_ISSUER`. */
    readonly id: string
    readonly email: string
    readonly emailVerified: boolean
    readonly created: boolean
}

export class NativeUserProvisioningError extends Error {
    constructor(public readonly reason: 'invalid-email' | 'ambiguous-email' | 'concurrently-removed') {
        super(`Native user provisioning failed: ${reason}`)
        this.name = NativeUserProvisioningError.name
    }
}

interface NativeUserRow {
    id: string
    email: string
    email_verified: boolean
}

/**
 * Creates or reuses a native user without a password, account, or session, so an invited person can later prove
 * mailbox control with a magic link. It never upgrades the verification flag and grants no business authority.
 */
export class NativeHumanUserProvisioner {
    constructor(private readonly database: NativeUserQueryable) {}

    async ensureUnverifiedByEmail(email: string): Promise<NativeHumanUser> {
        const normalized = normalizeNativeEmail(email)
        // Better Auth stores lowercase addresses; any case-variant duplicate predates that and is not ours to pick.
        const existing = await this.findByEmail(normalized)
        if (existing) return toUser(existing, false)

        // The unique email index settles a concurrent insert; the loser rereads the winner's row.
        const { rows: inserted } = await this.database.query<NativeUserRow>(
            `INSERT INTO ${users} (id, ${columns.name}, ${columns.email}, ${columns.emailVerified}, ${columns.createdAt}, ${columns.updatedAt})
             VALUES (gen_random_uuid(), '', $1, false, now(), now())
             ON CONFLICT (${columns.email}) DO NOTHING
             RETURNING id, ${columns.email} AS email, ${columns.emailVerified} AS email_verified`,
            [normalized],
        )
        if (inserted.length === 1) return toUser(inserted[0], true)

        const winner = await this.findByEmail(normalized)
        if (!winner) throw new NativeUserProvisioningError('concurrently-removed')
        return toUser(winner, false)
    }

    private async findByEmail(email: string): Promise<NativeUserRow | undefined> {
        const { rows } = await this.database.query<NativeUserRow>(
            `SELECT id, ${columns.email} AS email, ${columns.emailVerified} AS email_verified
             FROM ${users}
             WHERE lower(${columns.email}) = $1
             LIMIT 2`,
            [email],
        )
        if (rows.length > 1) throw new NativeUserProvisioningError('ambiguous-email')
        return rows[0]
    }
}

export function normalizeNativeEmail(email: string): string {
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
        throw new NativeUserProvisioningError('invalid-email')
    }
    return normalized
}

function toUser(row: NativeUserRow, created: boolean): NativeHumanUser {
    return { id: row.id, email: row.email, emailVerified: row.email_verified, created }
}
