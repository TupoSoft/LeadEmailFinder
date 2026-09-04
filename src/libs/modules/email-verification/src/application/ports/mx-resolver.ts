export const MX_RESOLVER = Symbol('MX_RESOLVER')

/** Consumed by the future real `MailboxProbe` adapter (module-architecture/14), not by application code. */
export interface MxResolver {
    resolve(domain: string): Promise<string[]>
}
