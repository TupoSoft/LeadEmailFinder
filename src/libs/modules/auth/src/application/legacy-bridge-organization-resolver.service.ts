import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Organization } from '@tuposoft/lead-email-finder/modules/identity'

export const LEGACY_BRIDGE_ORGANIZATION_NAME = 'Legacy API keys (temporary bridge)'

@Injectable()
export class LegacyBridgeOrganizationResolver implements OnModuleInit {
    private organizationId: string | undefined

    constructor(@InjectRepository(Organization) private readonly organizationRepo: Repository<Organization>) {}

    async onModuleInit(): Promise<void> {
        await this.resolve()
    }

    async resolve(): Promise<string> {
        if (this.organizationId) {
            return this.organizationId
        }

        const existing = await this.organizationRepo.findOneBy({ name: LEGACY_BRIDGE_ORGANIZATION_NAME })
        const organization =
            existing ??
            (await this.organizationRepo.save(this.organizationRepo.create({ name: LEGACY_BRIDGE_ORGANIZATION_NAME })))

        this.organizationId = organization.id

        return this.organizationId
    }
}
