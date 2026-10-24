import { ServiceCredentialRecord } from '../../domain/service-credential-record'

export const ACTIVE_SERVICE_CREDENTIAL_READER = Symbol('ACTIVE_SERVICE_CREDENTIAL_READER')

/** Uncached credential reads return safe records regardless of status; consumers enforce active status. */
export interface ActiveServiceCredentialReader {
    findByKeyHash(keyHash: string): Promise<ServiceCredentialRecord | undefined>

    findByIssuerAndSubject(issuer: string, subject: string): Promise<ServiceCredentialRecord | undefined>
}
