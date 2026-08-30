import { AuthPermission } from './auth-principal'
import { ServiceCredentialStatus } from './service-credential-status'

export interface ServiceCredentialRecord {
    readonly id: string
    readonly organizationId: string
    readonly issuer: string
    readonly subject: string
    readonly keycloakClientId: string
    readonly permissions: readonly AuthPermission[]
    readonly status: ServiceCredentialStatus
}
