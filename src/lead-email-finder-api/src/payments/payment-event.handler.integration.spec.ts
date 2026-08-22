import { randomUUID } from 'node:crypto'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
    CreditDebit,
    CreditGrant,
    Organization,
    OrganizationCreditAccount,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { CreditPurchase, CreditPurchaseStatus } from './credit-purchase.entity'
import { PaymentEventHandler } from './payment-event.handler'
import { PAYMENT_PURCHASE_STORE } from './payment-purchase.store'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/typeorm-payment-purchase.store'

// This suite owns its database because other integration specs also synchronize and drop their schemas.
const postgresUrl = process.env['TEST_PAYMENT_WEBHOOK_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe
const entities = [Organization, OrganizationCreditAccount, CreditDebit, CreditGrant, CreditPurchase]

describeWithPostgres('PaymentEventHandler against a real, freshly-synced Postgres schema', () => {
    let schemaDataSource: DataSource
    let moduleRef: TestingModule
    let handler: PaymentEventHandler
    let organizationId: string
    let purchase: CreditPurchase

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_PAYMENT_WEBHOOK_POSTGRES_URL must select a database whose name ends with _test')
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
            providers: [
                CreditsService,
                PaymentEventHandler,
                TypeOrmPaymentPurchaseStore,
                { provide: PAYMENT_PURCHASE_STORE, useExisting: TypeOrmPaymentPurchaseStore },
            ],
        }).compile()

        handler = moduleRef.get(PaymentEventHandler)
    })

    afterAll(async () => {
        await moduleRef.close()
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
    })

    beforeEach(async () => {
        organizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: organizationId, name: 'webhook-test-org' })
        await schemaDataSource.getRepository(OrganizationCreditAccount).save({ organizationId, balance: 10 })
        purchase = await schemaDataSource.getRepository(CreditPurchase).save({
            organizationId,
            packId: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            provider: 'stub',
            providerReference: `stub_${randomUUID()}`,
            status: CreditPurchaseStatus.PENDING,
        })
    })

    it('grants one ledger entry when the same paid event is delivered concurrently', async () => {
        const event = {
            kind: 'purchase_paid' as const,
            providerEventId: 'event-paid-concurrent',
            providerReference: purchase.providerReference!,
        }

        await Promise.all([handler.handle(event), handler.handle(event)])

        await expect(
            schemaDataSource.getRepository(CreditPurchase).findOneByOrFail({ id: purchase.id }),
        ).resolves.toMatchObject({ status: CreditPurchaseStatus.PAID })
        await expect(
            schemaDataSource.getRepository(OrganizationCreditAccount).findOneByOrFail({ organizationId }),
        ).resolves.toMatchObject({ balance: 110 })
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({ organizationId, reference: purchase.id }),
        ).resolves.toHaveLength(1)
    })

    it('correlates by purchase id, binds the reference, and grants once when a paid event arrives before checkout saves it', async () => {
        await schemaDataSource
            .getRepository(CreditPurchase)
            .update({ id: purchase.id }, { providerReference: null })
        const providerReference = `stub_${randomUUID()}`
        const event = {
            kind: 'purchase_paid' as const,
            providerEventId: 'event-paid-early',
            providerReference,
            purchaseId: purchase.id,
        }

        await Promise.all([handler.handle(event), handler.handle(event)])

        await expect(
            schemaDataSource.getRepository(CreditPurchase).findOneByOrFail({ id: purchase.id }),
        ).resolves.toMatchObject({ status: CreditPurchaseStatus.PAID, providerReference })
        await expect(
            schemaDataSource.getRepository(OrganizationCreditAccount).findOneByOrFail({ organizationId }),
        ).resolves.toMatchObject({ balance: 110 })
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({ organizationId, reference: purchase.id }),
        ).resolves.toHaveLength(1)
    })
})
