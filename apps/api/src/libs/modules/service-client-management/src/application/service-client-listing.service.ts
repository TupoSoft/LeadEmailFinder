import {
    AuthPrincipal,
    ServiceCredentialDetailRecord,
    ServiceCredentialDirectory,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ServiceClientAccessDeniedError } from '../domain/service-client-management.errors'

export class ServiceClientListingService {
    constructor(private readonly credentialDirectory: ServiceCredentialDirectory) {}

    async list(actor: AuthPrincipal, organizationId: string): Promise<readonly ServiceCredentialDetailRecord[]> {
        if (actor.organizationId !== organizationId) {
            throw new ServiceClientAccessDeniedError('Principal does not belong to this organization')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ServiceClientAccessDeniedError('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ServiceClientAccessDeniedError('Only an owner or admin may list service clients')
        }

        // Disabled clients remain visible with their status; only hard-deleted rows are absent.
        return this.credentialDirectory.listForOrganization(organizationId)
    }
}
