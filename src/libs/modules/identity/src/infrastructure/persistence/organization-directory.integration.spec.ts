import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { OrganizationDirectoryRecord } from '../../application/ports/organization-directory-reader'
import { Organization } from './organization.entity'
import { TypeOrmOrganizationDirectoryReader } from './typeorm-organization-directory-reader'

const postgresUrl = process.env['TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

describeWithPostgres('organization directory PostgreSQL pagination', () => {
    const schema = `organization_directory_${randomUUID().replaceAll('-', '')}`
    let dataSource: DataSource
    let reader: TypeOrmOrganizationDirectoryReader

    beforeAll(async () => {
        if (!new URL(postgresUrl!).pathname.slice(1).endsWith('_test')) {
            throw new Error(
                'TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL must select a database whose name ends with _test',
            )
        }
        dataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            schema,
            entities: [Organization],
            synchronize: false,
        })
        await dataSource.initialize()
        await dataSource.query(`CREATE SCHEMA "${schema}"`)
        await dataSource.synchronize()
        reader = new TypeOrmOrganizationDirectoryReader(dataSource)
    })

    beforeEach(async () => {
        await dataSource.getRepository(Organization).clear()
    })

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            try {
                await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await dataSource.destroy()
            }
        }
    })

    async function insert(id: number, createdAt: string): Promise<void> {
        await dataSource.query(
            `INSERT INTO "${schema}".organizations (id, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $3)`,
            [organizationId(id), `Synthetic directory organization ${id}`, createdAt],
        )
    }

    it('returns an empty directory without claiming a later page', async () => {
        await expect(reader.list({ limit: 2 })).resolves.toEqual({ organizations: [], hasMore: false })
    })

    it('uses UUID descending for equal timestamps across first, middle, and final pages', async () => {
        for (const id of [1, 4, 2, 3, 5]) await insert(id, '2026-08-31T12:00:00.123000Z')

        const first = await reader.list({ limit: 2 })
        const middle = await reader.list({ limit: 2, before: seek(first.organizations[1]) })
        const final = await reader.list({ limit: 2, before: seek(middle.organizations[1]) })

        expect(first.organizations.map(row => row.id)).toEqual([organizationId(5), organizationId(4)])
        expect(middle.organizations.map(row => row.id)).toEqual([organizationId(3), organizationId(2)])
        expect(final.organizations.map(row => row.id)).toEqual([organizationId(1)])
        expect([first.hasMore, middle.hasMore, final.hasMore]).toEqual([true, true, false])
    })

    it('neither skips nor duplicates different microseconds within the same serialized millisecond', async () => {
        await insert(4, '2026-08-31T12:00:00.123001Z')
        await insert(3, '2026-08-31T12:00:00.123999Z')
        await insert(2, '2026-08-31T12:00:00.123500Z')
        await insert(1, '2026-08-31T12:00:00.122999Z')

        const first = await reader.list({ limit: 1 })
        const second = await reader.list({ limit: 1, before: seek(first.organizations[0]) })
        const third = await reader.list({ limit: 1, before: seek(second.organizations[0]) })
        const final = await reader.list({ limit: 1, before: seek(third.organizations[0]) })
        const pages = [first, second, third, final]

        expect(pages.flatMap(page => page.organizations.map(row => row.id))).toEqual([4, 3, 2, 1].map(organizationId))
        expect(pages.map(page => page.organizations[0].createdAt.toISOString())).toEqual([
            '2026-08-31T12:00:00.123Z',
            '2026-08-31T12:00:00.123Z',
            '2026-08-31T12:00:00.123Z',
            '2026-08-31T12:00:00.122Z',
        ])
        expect(pages.map(page => page.hasMore)).toEqual([true, true, true, false])
    })

    it('keeps existing pages stable when a newer organization is inserted between requests', async () => {
        for (const id of [1, 2, 3, 4]) await insert(id, '2026-08-31T12:00:00.123000Z')
        const first = await reader.list({ limit: 2 })

        await insert(5, '2026-08-31T12:00:01.456789Z')
        const final = await reader.list({ limit: 2, before: seek(first.organizations[1]) })

        expect([...first.organizations, ...final.organizations].map(row => row.id)).toEqual(
            [4, 3, 2, 1].map(organizationId),
        )
        expect(final.hasMore).toBe(false)
        const refreshed = await reader.list({ limit: 2 })
        expect(refreshed.organizations.map(row => row.id)).toEqual([organizationId(5), organizationId(4)])
        expect(refreshed.organizations[0]).toEqual({
            id: organizationId(5),
            name: 'Synthetic directory organization 5',
            createdAt: new Date('2026-08-31T12:00:01.456Z'),
            updatedAt: new Date('2026-08-31T12:00:01.456Z'),
        })
    })

    it('continues past a removed boundary row using its complete seek key', async () => {
        for (const id of [1, 2, 3]) await insert(id, '2026-08-31T12:00:00.123000Z')
        const first = await reader.list({ limit: 1 })
        await dataSource.getRepository(Organization).delete(first.organizations[0].id)

        const final = await reader.list({ limit: 2, before: seek(first.organizations[0]) })

        expect(final.organizations.map(row => row.id)).toEqual([organizationId(2), organizationId(1)])
        expect(final.hasMore).toBe(false)
    })
})

function organizationId(id: number): string {
    return `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
}

function seek(row: OrganizationDirectoryRecord): { createdAtMilliseconds: number; id: string } {
    return { createdAtMilliseconds: row.createdAt.getTime(), id: row.id }
}
