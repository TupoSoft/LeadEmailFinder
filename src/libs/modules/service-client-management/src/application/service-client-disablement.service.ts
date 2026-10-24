import {
    AuthPrincipal,
    ServiceCredentialDirectory,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientAccessDeniedError, ServiceClientNotFoundError } from '../domain/service-client-management.errors'

export class ServiceClientDisablementService {
    constructor(
        private readonly credentialDirectory: ServiceCredentialDirectory,
        private readonly credentialWriter: ServiceCredentialWriter,
    ) {}

    async disable(actor: AuthPrincipal, organizationId: string, serviceClientId: string): Promise<void> {
        if (actor.organizationId !== organizationId) {
            throw new ServiceClientNotFoundError()
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ServiceClientAccessDeniedError('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ServiceClientAccessDeniedError('Only an owner or admin may disable service clients')
        }

        const credential = await this.credentialDirectory.findByIdForOrganization(serviceClientId, organizationId)
        if (!credential) {
            throw new ServiceClientNotFoundError()
        }

        // Authentication reads committed credential status on every request; disablement has no cache delay.
        const outcome = await this.credentialWriter.disableWithAudit(credential, actor)
        if (outcome === 'not-found') {
            throw new ServiceClientNotFoundError()
        }
    }
}
