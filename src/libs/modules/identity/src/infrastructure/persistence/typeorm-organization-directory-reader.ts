import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
    OrganizationDirectoryPage,
    OrganizationDirectoryReader,
    OrganizationDirectoryReadInput,
    OrganizationDirectoryRecord,
} from '../../application/ports/organization-directory-reader'
import { Organization } from './organization.entity'

const millisecondCreationTime = "date_trunc('milliseconds', organization.createdAt)"

@Injectable()
export class TypeOrmOrganizationDirectoryReader implements OrganizationDirectoryReader {
    constructor(private readonly dataSource: DataSource) {}

    async list(input: OrganizationDirectoryReadInput): Promise<OrganizationDirectoryPage> {
        const query = this.dataSource
            .getRepository(Organization)
            .createQueryBuilder('organization')
            .select('organization.id', 'id')
            .addSelect('organization.name', 'name')
            .addSelect(millisecondCreationTime, 'createdAt')
            .addSelect('organization.updatedAt', 'updatedAt')
            .orderBy(millisecondCreationTime, 'DESC')
            .addOrderBy('organization.id', 'DESC')
            .limit(input.limit + 1)

        if (input.before) {
            query.where(`(${millisecondCreationTime}, organization.id) < (:createdAt, :id)`, {
                createdAt: new Date(input.before.createdAtMilliseconds),
                id: input.before.id,
            })
        }

        const rows = await query.getRawMany<OrganizationDirectoryRecord>()
        return {
            organizations: rows.slice(0, input.limit).map(row => ({
                id: row.id,
                name: row.name,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            })),
            hasMore: rows.length > input.limit,
        }
    }
}
