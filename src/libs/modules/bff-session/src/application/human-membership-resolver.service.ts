import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OrganizationMembership } from '@tuposoft/lead-email-finder/modules/identity'

@Injectable()
export class HumanMembershipResolver {
    constructor(
        @InjectRepository(OrganizationMembership)
        private readonly membershipRepo: Repository<OrganizationMembership>,
    ) {}

    async resolveActive(organizationId: string, externalIdentityId: string): Promise<OrganizationMembership> {
        const membership = await this.membershipRepo.findOne({ where: { organizationId, externalIdentityId } })

        if (!membership || membership.status !== 'active') {
            throw new UnauthorizedException('Organization membership is unknown or disabled')
        }

        return membership
    }

    async resolveActiveForLogin(externalIdentityId: string): Promise<OrganizationMembership> {
        const memberships = await this.membershipRepo.find({ where: { externalIdentityId, status: 'active' } })

        if (memberships.length !== 1) {
            throw new ForbiddenException('Sign-in requires exactly one active organization membership')
        }

        return memberships[0]
    }
}
