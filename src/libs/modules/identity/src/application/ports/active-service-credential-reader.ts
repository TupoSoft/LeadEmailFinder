import { ServiceCredentialRecord } from '../../domain/service-credential-record'

export const ACTIVE_SERVICE_CREDENTIAL_READER = Symbol('ACTIVE_SERVICE_CREDENTIAL_READER')

/** Read-only lookup by (issuer, subject); returns the record regardless of `status`. See `ActiveMembershipReader`. */
export interface ActiveServiceCredentialReader {
    findByIssuerAndSubject(issuer: string, subject: string): Promise<ServiceCredentialRecord | undefined>
}
