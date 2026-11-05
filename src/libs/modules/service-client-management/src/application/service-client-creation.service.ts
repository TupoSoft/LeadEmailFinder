import { randomUUID } from 'node:crypto'
import {
    AUTH_IDENTITY_ISSUER,
    AuthPermission,
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientGrantPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import {
    DuplicateServiceClientPermissionsError,
    EmptyServiceClientPermissionsError,
    ServiceClientAccessDeniedError,
    ServiceClientPermissionCeilingExceededError,
} from '../domain/service-client-management.errors'
import { ApiKeyGenerator } from './ports/api-key-generator'

export interface ServiceClientCreationResult {
    readonly credential: ServiceCredentialDetailRecord
    readonly apiKey: string
}

export class ServiceClientCreationService {
    constructor(
        private readonly credentialWriter: ServiceCredentialWriter,
        private readonly serviceClientGrantPolicy: ServiceClientGrantPolicy,
        private readonly generateApiKey: ApiKeyGenerator,
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

        if (permissions.length === 0) {
            throw new EmptyServiceClientPermissionsError()
        }
        if (new Set(permissions).size !== permissions.length) {
            throw new DuplicateServiceClientPermissionsError()
        }

        const allowedPermissions: readonly AuthPermission[] = this.serviceClientGrantPolicy.grantablePermissionsFor(
            actor.membershipRole,
        )
        const excessPermissions = permissions.filter(permission => !allowedPermissions.includes(permission))
        if (excessPermissions.length > 0) {
            throw new ServiceClientPermissionCeilingExceededError(excessPermissions)
        }

        const id = randomUUID()
        const { apiKey, keyHash, keyPrefix } = this.generateApiKey()
        const credential = await this.credentialWriter.createWithAudit({
            id,
            organizationId,
            issuer: AUTH_IDENTITY_ISSUER,
            subject: id,
            keyHash,
            keyPrefix,
            description,
            permissions,
            actor,
        })

        return { credential, apiKey }
    }
}
