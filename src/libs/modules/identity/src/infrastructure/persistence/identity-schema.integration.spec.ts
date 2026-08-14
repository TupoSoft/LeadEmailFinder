import { DataSource } from 'typeorm'
import { ExternalIdentity } from './external-identity.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { OrganizationMembership } from './membership.entity'
import { Organization } from './organization.entity'
import { ServiceCredential } from './service-credential.entity'

const postgresUrl = process.env['TEST_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

describeWithPostgres('identity schema synchronization', () => {
    let dataSource: DataSource

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_POSTGRES_URL must select a database whose name ends with _test')
        }

        dataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            dropSchema: true,
            synchronize: true,
            entities: [
                Organization,
                ExternalIdentity,
                OrganizationMembership,
                ServiceCredential,
                OrganizationCreditAccount,
            ],
        })
        await dataSource.initialize()
    })

    afterAll(async () => {
        if (dataSource?.isInitialized) await dataSource.destroy()
    })

    it('creates every identity and organization table in an empty PostgreSQL database', async () => {
        const tables = await dataSource.query<Array<{ table_name: string }>>(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
             ORDER BY table_name`,
        )

        expect(tables.map(({ table_name }) => table_name)).toEqual([
            'external_identities',
            'organization_credit_accounts',
            'organization_memberships',
            'organizations',
            'service_credentials',
        ])
    })
})
