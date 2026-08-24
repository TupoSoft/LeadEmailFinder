import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuthPrincipal, OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class MembershipListingService {
    constructor(
        @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    ) {}

    async listActive(actor: AuthPrincipal, organizationId: string): Promise<OrganizationMembership[]> {
        if (actor.organizationId !== organizationId) {
            throw new ForbiddenException('Principal does not belong to this organization')
        }
        if (actor.membershipRole !== 'owner' && actor.membershipRole !== 'admin') {
            throw new ForbiddenException('Only an owner or admin may list members')
        }

        return this.membershipRepo.find({ where: { organizationId }, relations: ['externalIdentity'] })
    }
}
