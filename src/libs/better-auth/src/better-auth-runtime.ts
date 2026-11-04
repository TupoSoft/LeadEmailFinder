import { Pool } from 'pg'
import { BetterAuthConfiguration } from './better-auth-configuration'
import { AuthMailDelivery } from './mail/auth-mail-delivery'
import { AuthMailTransport, createNodemailerTransport, SmtpAuthMailDelivery } from './mail/smtp-auth-mail-delivery'
import { BetterAuthLibrary, loadBetterAuthLibrary } from './native/better-auth-library'
import { createNativeAuth, NativeAuth } from './native/create-native-auth'
import { NativeHumanUserProvisioner } from './provisioning/native-human-user-provisioner'

export const BETTER_AUTH_RUNTIME = Symbol('BETTER_AUTH_RUNTIME')

const POOL_SIZE = 5
const CONNECTION_TIMEOUT_MS = 10_000

/** One native instance with the PostgreSQL pool and mail transport it owns. */
export interface BetterAuthRuntime {
    readonly auth: NativeAuth
    readonly provisioner: NativeHumanUserProvisioner
    readonly mailDelivery: AuthMailDelivery
    /** Releases the pool and mail transport; safe to call more than once. */
    close(): Promise<void>
}

/** Substitutes for tests; production composition uses the installed package, `pg`, and SMTP. */
export interface BetterAuthRuntimeOverrides {
    readonly library?: BetterAuthLibrary
    readonly pool?: Pool
    readonly mailTransport?: AuthMailTransport
}

export async function openBetterAuthRuntime(
    configuration: BetterAuthConfiguration,
    overrides: BetterAuthRuntimeOverrides = {},
): Promise<BetterAuthRuntime> {
    const pool =
        overrides.pool ??
        new Pool({
            connectionString: configuration.databaseUrl,
            max: POOL_SIZE,
            connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        })
    const transport = overrides.mailTransport ?? createNodemailerTransport(configuration.mail)
    const mailDelivery = new SmtpAuthMailDelivery(transport, configuration.mail.from)
    let closed: Promise<void> | undefined
    const close = (): Promise<void> => {
        closed ??= (async () => {
            mailDelivery.close()
            await pool.end()
        })()
        return closed
    }

    try {
        const library = overrides.library ?? (await loadBetterAuthLibrary())
        return {
            auth: createNativeAuth(library, { configuration, pool, mailDelivery }),
            provisioner: new NativeHumanUserProvisioner(pool),
            mailDelivery,
            close,
        }
    } catch (error: unknown) {
        await close()
        throw error
    }
}
