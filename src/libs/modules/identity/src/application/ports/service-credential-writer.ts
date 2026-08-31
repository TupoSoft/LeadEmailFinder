import { AuthPermission, AuthPrincipal } from '../../domain/auth-principal'
import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'

export const SERVICE_CREDENTIAL_WRITER = Symbol('SERVICE_CREDENTIAL_WRITER')

export interface CreateServiceCredentialCommand {
    readonly id: string
    readonly organizationId: string
    readonly issuer: string
    readonly subject: string
    readonly keycloakClientId: string
    readonly description: string | null
    readonly permissions: readonly AuthPermission[]
    readonly actor: AuthPrincipal
}

export type ServiceCredentialRotationOutcome =
    | { readonly kind: 'rotated'; readonly credential: ServiceCredentialDetailRecord }
    | { readonly kind: 'disabled' }
    | { readonly kind: 'not-found' }

export type ServiceCredentialDisableOutcome = 'disabled' | 'already-disabled' | 'not-found'

export type ServiceCredentialDeleteOutcome = 'deleted' | 'not-found'

/** Atomic credential and audit mutations used by service-client management. */
export interface ServiceCredentialWriter {
    createWithAudit(command: CreateServiceCredentialCommand): Promise<ServiceCredentialDetailRecord>

    rotateWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialRotationOutcome>

    disableWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialDisableOutcome>

    deleteWithAudit(
        credential: ServiceCredentialDetailRecord,
        actor: AuthPrincipal,
    ): Promise<ServiceCredentialDeleteOutcome>
}
