import { ExternalIdentityRecord } from '../domain/external-identity-record'
import { ExternalIdentityConflictError, ExternalIdentityStore } from './ports/external-identity-store'

/**
 * Framework-free counterpart to `HumanIdentityResolver`, proven standalone ahead of its eventual consumers
 * (`module-architecture/03`/`06`). Reproduces the same lookup/email-refresh/create/unique-race-recovery behavior
 * entirely through `ExternalIdentityStore`, with no transaction-manager parameter: that parameter exists on the
 * legacy resolver only so `invitation-acceptance.service.ts` can enlist identity creation in its own ambient
 * transaction, which is `module-architecture/06`'s concern, not this one's.
 */
export class ExternalIdentityResolver {
    constructor(private readonly store: ExternalIdentityStore) {}

    async resolveOrCreate(issuer: string, subject: string, email: string | null): Promise<ExternalIdentityRecord> {
        const existing = await this.store.findByIssuerAndSubject(issuer, subject)

        if (existing) {
            return existing.email !== email ? this.store.updateEmail(existing, email) : existing
        }

        try {
            return await this.store.create(issuer, subject, email)
        } catch (error) {
            if (error instanceof ExternalIdentityConflictError) {
                const raced = await this.store.findByIssuerAndSubject(issuer, subject)
                if (raced) {
                    return raced
                }
            }
            throw error
        }
    }
}
