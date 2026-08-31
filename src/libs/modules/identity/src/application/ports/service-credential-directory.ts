import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'

export const SERVICE_CREDENTIAL_DIRECTORY = Symbol('SERVICE_CREDENTIAL_DIRECTORY')

export interface ServiceCredentialDirectory {
    /** Includes disabled credentials and returns the oldest credential first. */
    listForOrganization(organizationId: string): Promise<readonly ServiceCredentialDetailRecord[]>

    findByIdForOrganization(id: string, organizationId: string): Promise<ServiceCredentialDetailRecord | undefined>
}
