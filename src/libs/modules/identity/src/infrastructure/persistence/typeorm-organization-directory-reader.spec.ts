import { DataSource, Repository, SelectQueryBuilder } from 'typeorm'
import { OrganizationDirectoryRecord } from '../../application/ports/organization-directory-reader'
import { Organization } from './organization.entity'
import { TypeOrmOrganizationDirectoryReader } from './typeorm-organization-directory-reader'

type QueryBuilderMock = jest.Mocked<
    Pick<
        SelectQueryBuilder<Organization>,
        'select' | 'addSelect' | 'orderBy' | 'addOrderBy' | 'limit' | 'where' | 'getRawMany'
    >
>

describe('TypeOrmOrganizationDirectoryReader', () => {
    let query: QueryBuilderMock
    let reader: TypeOrmOrganizationDirectoryReader

    beforeEach(() => {
        query = {
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawMany: jest.fn(),
        }
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(query),
        } as unknown as Repository<Organization>
        reader = new TypeOrmOrganizationDirectoryReader({
            getRepository: jest.fn().mockReturnValue(repository),
        } as unknown as DataSource)
    })

    it('fetches one extra row, returns only requested records, and reports another page', async () => {
        const rows = [record('3'), record('2'), record('1')]
        query.getRawMany.mockResolvedValue(rows)

        await expect(reader.list({ limit: 2 })).resolves.toEqual({
            organizations: rows.slice(0, 2),
            hasMore: true,
        })
        expect(query.limit).toHaveBeenCalledWith(3)
        expect(query.where).not.toHaveBeenCalled()
        expect(query.select).toHaveBeenCalledWith('organization.id', 'id')
        expect(query.addSelect.mock.calls).toEqual([
            ['organization.name', 'name'],
            ["date_trunc('milliseconds', organization.createdAt)", 'createdAt'],
            ['organization.updatedAt', 'updatedAt'],
        ])
        expect(query.orderBy).toHaveBeenCalledWith("date_trunc('milliseconds', organization.createdAt)", 'DESC')
        expect(query.addOrderBy).toHaveBeenCalledWith('organization.id', 'DESC')
    })

    it.each([0, 1, 2])('does not claim another page when %i records fit within the limit', async count => {
        const rows = Array.from({ length: count }, (_, index) => record(String(index)))
        query.getRawMany.mockResolvedValue(rows)

        await expect(reader.list({ limit: 2 })).resolves.toEqual({ organizations: rows, hasMore: false })
    })

    it('uses the exact ordering expression with the typed timestamp and UUID seek key', async () => {
        query.getRawMany.mockResolvedValue([])
        const before = { createdAtMilliseconds: 1788177600123, id: '00000000-0000-4000-8000-000000000002' }

        await reader.list({ limit: 1, before })

        expect(query.where).toHaveBeenCalledWith(
            "(date_trunc('milliseconds', organization.createdAt), organization.id) < (:createdAt, :id)",
            { createdAt: new Date(before.createdAtMilliseconds), id: before.id },
        )
        expect(query.limit).toHaveBeenCalledWith(2)
    })

    it('propagates persistence failures to the caller', async () => {
        const failure = new Error('database unavailable')
        query.getRawMany.mockRejectedValue(failure)

        await expect(reader.list({ limit: 2 })).rejects.toBe(failure)
    })
})

function record(id: string): OrganizationDirectoryRecord {
    return {
        id,
        name: `Synthetic organization ${id}`,
        createdAt: new Date('2026-08-31T12:00:00.123Z'),
        updatedAt: new Date('2026-08-31T12:00:00.123Z'),
    }
}
