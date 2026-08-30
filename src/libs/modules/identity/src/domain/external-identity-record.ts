export interface ExternalIdentityRecord {
    readonly id: string
    readonly issuer: string
    readonly subject: string
    readonly email: string | null
}
