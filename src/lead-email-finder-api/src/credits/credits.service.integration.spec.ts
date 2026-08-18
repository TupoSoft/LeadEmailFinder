import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    CreditDebit,
    CreditGrant,
    Organization,
    OrganizationCreditAccount,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './credits.service'

// Deliberately its own env var, not TEST_POSTGRES_URL: identity-schema.integration.spec.ts also gates on
// TEST_POSTGRES_URL and does its own dropSchema+synchronize. Jest runs spec files in parallel workers, so
// both tests racing dropSchema against the same database in one full-suite run would corrupt each other.
const postgresUrl = process.env['TEST_CREDITS_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

const entities = [Organization, OrganizationCreditAccount, CreditDebit, CreditGrant]

describeWithPostgres('CreditsService against a real, freshly-synced Postgres schema', () => {
    let schemaDataSource: DataSource
    let moduleRef: TestingModule
    let service: CreditsService
    let organizationId: string

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_CREDITS_POSTGRES_URL must select a database whose name ends with _test')
        }

        schemaDataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            dropSchema: true,
            synchronize: true,
            entities,
        })
        await schemaDataSource.initialize()

        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({ type: 'postgres', url: postgresUrl, synchronize: false, entities }),
                TypeOrmModule.forFeature(entities),
            ],
            providers: [CreditsService],
        }).compile()

        service = moduleRef.get(CreditsService)
    })

    afterAll(async () => {
        await moduleRef.close()
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
    })

    beforeEach(async () => {
        organizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: organizationId, name: 'credits-test-org' })
        await schemaDataSource.getRepository(OrganizationCreditAccount).save({ organizationId, balance: 10 })
    })

    it('never lets concurrent debits push the balance negative', async () => {
        const results = await Promise.allSettled([
            service.debit(organizationId, 10, 'ref-a'),
            service.debit(organizationId, 10, 'ref-b'),
        ])

        const fulfilled = results.filter(result => result.status === 'fulfilled')
        expect(fulfilled).toHaveLength(1)

        const balance = await service.getBalance(organizationId)
        expect(balance).toBe(0)
    })

    it('does not double-charge when the same reference is retried concurrently', async () => {
        await Promise.all([service.debit(organizationId, 1, 'dup-ref'), service.debit(organizationId, 1, 'dup-ref')])

        const balance = await service.getBalance(organizationId)
        expect(balance).toBe(9)

        const debitRows = await schemaDataSource
            .getRepository(CreditDebit)
            .findBy({ organizationId, reference: 'dup-ref' })
        expect(debitRows).toHaveLength(1)
    })

    it('creates an account and records the first grant', async () => {
        const newOrganizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: newOrganizationId, name: 'new-credits-test-org' })

        await expect(service.credit(newOrganizationId, 5, 'first-grant')).resolves.toBe(5)
        await expect(service.getBalance(newOrganizationId)).resolves.toBe(5)

        const grantRows = await schemaDataSource
            .getRepository(CreditGrant)
            .findBy({ organizationId: newOrganizationId, reference: 'first-grant' })
        expect(grantRows).toEqual([expect.objectContaining({ amount: 5 })])
    })

    it('applies a repeated grant reference once', async () => {
        await expect(service.credit(organizationId, 5, 'dup-grant')).resolves.toBe(15)
        await expect(service.credit(organizationId, 5, 'dup-grant')).resolves.toBe(15)

        await expect(service.getBalance(organizationId)).resolves.toBe(15)
        const grantRows = await schemaDataSource
            .getRepository(CreditGrant)
            .findBy({ organizationId, reference: 'dup-grant' })
        expect(grantRows).toHaveLength(1)
    })

    it('sums concurrent grants with distinct references', async () => {
        await Promise.all([service.credit(organizationId, 3, 'grant-a'), service.credit(organizationId, 7, 'grant-b')])

        await expect(service.getBalance(organizationId)).resolves.toBe(20)
        const grantRows = await schemaDataSource.getRepository(CreditGrant).findBy({ organizationId })
        expect(grantRows).toHaveLength(2)
    })
})
