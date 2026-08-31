import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    DisabledServiceClientRotationError,
    ServiceClientAccessDeniedError,
    ServiceClientNotFoundError,
} from '../domain/service-client-management.errors'
import { KeycloakServiceClientAdmin } from './ports/keycloak-service-client-admin'

export interface ServiceClientRotationResult {
    readonly credential: ServiceCredentialDetailRecord
    readonly secret: string
}

export class ServiceClientRotationService {
    constructor(
        private readonly credentialDirectory: ServiceCredentialDirectory,
        private readonly credentialWriter: ServiceCredentialWriter,
        private readonly keycloakAdmin: KeycloakServiceClientAdmin,
    ) {}

    async rotate(
        actor: AuthPrincipal,
        organizationId: string,
        serviceClientId: string,
    ): Promise<ServiceClientRotationResult> {
        if (actor.organizationId !== organizationId) {
            throw new ServiceClientNotFoundError()
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ServiceClientAccessDeniedError('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ServiceClientAccessDeniedError('Only an owner or admin may rotate service clients')
        }

        const credential = await this.credentialDirectory.findByIdForOrganization(serviceClientId, organizationId)
        if (!credential) {
            throw new ServiceClientNotFoundError()
        }
        if (credential.status === 'disabled') {
            throw new DisabledServiceClientRotationError()
        }

        const secret = await this.keycloakAdmin.rotateSecret(credential.keycloakClientId)
        const outcome = await this.credentialWriter.rotateWithAudit(credential, actor)
        if (outcome.kind === 'not-found') {
            throw new ServiceClientNotFoundError()
        }
        if (outcome.kind === 'disabled') {
            throw new DisabledServiceClientRotationError()
        }

        return { credential: outcome.credential, secret }
    }
}
