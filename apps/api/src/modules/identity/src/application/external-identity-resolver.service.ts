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

    async findExisting(issuer: string, subject: string): Promise<ExternalIdentityRecord | undefined> {
        return this.store.findByIssuerAndSubject(issuer, subject)
    }

    async synchronizeEmail(existing: ExternalIdentityRecord, email: string | null): Promise<ExternalIdentityRecord> {
        return existing.email !== email ? this.store.updateEmail(existing, email) : existing
    }

    async resolveOrCreate(issuer: string, subject: string, email: string | null): Promise<ExternalIdentityRecord> {
        const existing = await this.findExisting(issuer, subject)

        if (existing) {
            return this.synchronizeEmail(existing, email)
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
