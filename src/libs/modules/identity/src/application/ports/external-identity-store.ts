import { ExternalIdentityRecord } from '../../domain/external-identity-record'

export const EXTERNAL_IDENTITY_STORE = Symbol('EXTERNAL_IDENTITY_STORE')

/** Framework-free signal for a Postgres unique-violation race on (issuer, subject); see `ExternalIdentityResolver`. */
export class ExternalIdentityConflictError extends Error {
    constructor(
        public readonly issuer: string,
        public readonly subject: string,
    ) {
        super(`External identity for issuer "${issuer}" and subject "${subject}" already exists`)
        this.name = ExternalIdentityConflictError.name
    }
}

export interface ExternalIdentityStore {
    findByIssuerAndSubject(issuer: string, subject: string): Promise<ExternalIdentityRecord | undefined>
    updateEmail(existing: ExternalIdentityRecord, email: string | null): Promise<ExternalIdentityRecord>
    /** Throws `ExternalIdentityConflictError` when a concurrent insert already created this (issuer, subject). */
    create(issuer: string, subject: string, email: string | null): Promise<ExternalIdentityRecord>
}
