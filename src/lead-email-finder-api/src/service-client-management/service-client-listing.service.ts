import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuthPrincipal, ServiceCredential } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class ServiceClientListingService {
    constructor(
        @InjectRepository(ServiceCredential) private readonly serviceCredentialRepo: Repository<ServiceCredential>,
    ) {}

    async list(actor: AuthPrincipal, organizationId: string): Promise<ServiceCredential[]> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.credentialKind !== 'human_session') {
            throw new ForbiddenException('Only a human session may manage service clients')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may list service clients')
        }

        // Disabled clients remain visible with their status; only hard-deleted rows are absent.
        return this.serviceCredentialRepo.find({ where: { organizationId } })
    }
}
