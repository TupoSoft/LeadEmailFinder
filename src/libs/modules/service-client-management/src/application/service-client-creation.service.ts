import { randomUUID } from 'node:crypto'
import {
    AuthPermission,
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import {
    ServiceClientAccessDeniedError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'
import { KeycloakServiceClientAdmin } from './ports/keycloak-service-client-admin'
import { ServiceClientManagementConfiguration } from './service-client-management-configuration'

export interface ServiceClientCreationResult {
    readonly credential: ServiceCredentialDetailRecord
    readonly secret: string
}

export class ServiceClientCreationService {
    constructor(
        private readonly credentialWriter: ServiceCredentialWriter,
        private readonly keycloakAdmin: KeycloakServiceClientAdmin,
        private readonly configuration: ServiceClientManagementConfiguration,
        private readonly rolePermissionPolicy: RolePermissionPolicy,
    ) {}

    async create(
        actor: AuthPrincipal,
        organizationId: string,
        description: string | null,
        permissions: readonly AuthPermission[],
    ): Promise<ServiceClientCreationResult> {
        if (actor.organizationId !== organizationId) {
            throw new ServiceClientAccessDeniedError('Principal does not belong to this organization')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ServiceClientAccessDeniedError('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ServiceClientAccessDeniedError('Only an owner or admin may create service clients')
        }

        const allowedPermissions = this.rolePermissionPolicy.effectivePermissionsFor(actor)
        const excessPermissions = permissions.filter(permission => !allowedPermissions.includes(permission))
        if (excessPermissions.length > 0) {
            throw new ServiceClientPermissionCeilingExceededError(excessPermissions)
        }

        const id = randomUUID()
        const keycloakClientId = `lef-svc-${id}`
        const { subject, secret } = await this.keycloakAdmin.provisionClient({ keycloakClientId, description })

        let credential: ServiceCredentialDetailRecord
        try {
            credential = await this.credentialWriter.createWithAudit({
                id,
                organizationId,
                issuer: this.configuration.issuer,
                subject,
                keycloakClientId,
                description,
                permissions,
                actor,
            })
        } catch (error) {
            // The generated client id is unique to this request, so compensating here cannot remove a client
            // owned by another operation. Keep the original persistence error if best-effort cleanup also fails.
            try {
                await this.keycloakAdmin.deleteClient(keycloakClientId)
            } catch {
                // The client remains inert because its secret was never returned and it has no local binding.
            }
            throw error
        }

        return { credential, secret }
    }
}
