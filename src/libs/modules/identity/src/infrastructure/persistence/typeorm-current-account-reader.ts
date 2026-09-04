import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    CurrentAccountReadInput,
    CurrentAccountReader,
    CurrentAccountRecord,
} from '../../application/ports/current-account-reader'
import { AuthRole } from '../../domain/auth-principal'
import { OrganizationMembership } from './membership.entity'

interface CurrentAccountRow {
    readonly email: string | null
    readonly membershipId: string
    readonly membershipRole: AuthRole
    readonly organizationId: string
    readonly organizationName: string
}

@Injectable()
export class TypeOrmCurrentAccountReader implements CurrentAccountReader {
    constructor(
        @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    ) {}

    async read(input: CurrentAccountReadInput): Promise<CurrentAccountRecord | undefined> {
        const rows = await this.membershipRepo
            .createQueryBuilder('membership')
            .innerJoin('membership.externalIdentity', 'externalIdentity')
            .innerJoin('membership.organization', 'organization')
            .select('externalIdentity.email', 'email')
            .addSelect('membership.id', 'membershipId')
            .addSelect('membership.role', 'membershipRole')
            .addSelect('organization.id', 'organizationId')
            .addSelect('organization.name', 'organizationName')
            .where('membership.externalIdentityId = :externalIdentityId', {
                externalIdentityId: input.externalIdentityId,
            })
            .andWhere('membership.status = :status', { status: 'active' })
            .take(2)
            .getRawMany<CurrentAccountRow>()

        if (rows.length !== 1 || rows[0].organizationId !== input.organizationId) {
            return undefined
        }

        const row = rows[0]
        return {
            email: row.email,
            membership: {
                id: row.membershipId,
                role: row.membershipRole,
            },
            organization: {
                id: row.organizationId,
                name: row.organizationName,
            },
        }
    }
}
