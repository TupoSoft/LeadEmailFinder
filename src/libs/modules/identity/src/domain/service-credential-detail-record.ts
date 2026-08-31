import { ServiceCredentialRecord } from './service-credential-record'

/** Service-credential fields required by management workflows and their HTTP responses. */
export interface ServiceCredentialDetailRecord extends ServiceCredentialRecord {
    readonly description: string | null
    readonly createdAt: Date
    readonly updatedAt: Date
}
