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
import { CreditsService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import {
    CreditPurchaseAdjustment,
    CreditPurchaseAdjustmentState,
} from './credit-purchase-adjustment.entity'
import { CreditPurchase, CreditPurchaseStatus } from './credit-purchase.entity'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import {
    PAYMENT_ADJUSTMENT_STORE,
    PaymentAdjustmentDirectionInProgressError,
    PaymentAdjustmentStore,
} from './payment-adjustment.store'
import { PaymentEventHandler } from './payment-event.handler'
import { PaymentEvent } from './payment-provider'
import { PAYMENT_PURCHASE_STORE, PaymentPurchaseStore } from './payment-purchase.store'
import { TypeOrmPaymentAdjustmentStore } from './infrastructure/typeorm-payment-adjustment.store'
import { TypeOrmPaymentPurchaseStore } from './infrastructure/typeorm-payment-purchase.store'

// This suite owns its database because other integration specs also synchronize and drop their schemas.
const postgresUrl = process.env['TEST_PAYMENT_WEBHOOK_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe
const entities = [
    Organization,
    OrganizationCreditAccount,
    CreditDebit,
    CreditGrant,
    CreditPurchase,
    CreditPurchaseAdjustment,
]
type AdjustmentEvent = Extract<
    PaymentEvent,
    { kind: 'purchase_adjustment_debit' | 'purchase_adjustment_restore' }
>

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void
    const promise = new Promise<void>(done => {
        resolve = done
    })
    return { promise, resolve }
}

describeWithPostgres('PaymentEventHandler against a real, freshly-synced Postgres schema', () => {
    let schemaDataSource: DataSource
    let moduleRef: TestingModule
    let handler: PaymentEventHandler
    let credits: CreditsService
    let adjustmentStore: PaymentAdjustmentStore
    let purchaseStore: PaymentPurchaseStore
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
                PaymentAdjustmentHandler,
                TypeOrmPaymentPurchaseStore,
                TypeOrmPaymentAdjustmentStore,
                { provide: PAYMENT_PURCHASE_STORE, useExisting: TypeOrmPaymentPurchaseStore },
                { provide: PAYMENT_ADJUSTMENT_STORE, useExisting: TypeOrmPaymentAdjustmentStore },
            ],
        }).compile()

        handler = moduleRef.get(PaymentEventHandler)
        credits = moduleRef.get(CreditsService)
        adjustmentStore = moduleRef.get(PAYMENT_ADJUSTMENT_STORE)
        purchaseStore = moduleRef.get(PAYMENT_PURCHASE_STORE)
    })

    afterAll(async () => {
        await moduleRef.close()
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
    })

    afterEach(() => {
        jest.restoreAllMocks()
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

    async function settlePurchase(providerTotalMinor = 500): Promise<void> {
        await handler.handle({
            kind: 'purchase_paid',
            providerEventId: `paid-${purchase.id}`,
            providerReference: purchase.providerReference!,
            providerTotalMinor,
            currency: 'USD',
        })
    }

    function adjustmentEvent(
        kind: 'purchase_adjustment_debit' | 'purchase_adjustment_restore',
        providerAdjustmentId: string,
        amountMinor = 500,
        isFull = amountMinor === 500,
    ): AdjustmentEvent {
        return {
            kind,
            providerEventId: `event-${providerAdjustmentId}`,
            providerReference: purchase.providerReference!,
            providerAdjustmentId,
            amountMinor,
            isFull,
            currency: 'USD',
        }
    }

    it('grants one ledger entry when the same paid event is delivered concurrently', async () => {
        const event = {
            kind: 'purchase_paid' as const,
            providerEventId: 'event-paid-concurrent',
            providerReference: purchase.providerReference!,
            providerTotalMinor: 500,
            currency: 'USD',
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
            providerTotalMinor: 500,
            currency: 'USD',
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

    it('debits, replays, restores, and restore-replays one full adjustment exactly once', async () => {
        await settlePurchase()
        const debit = adjustmentEvent('purchase_adjustment_debit', 'adjustment-debit')
        const restore = adjustmentEvent('purchase_adjustment_restore', 'adjustment-restore')

        await handler.handle(debit)
        await handler.handle(debit)
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)

        await handler.handle(restore)
        await handler.handle(restore)
        await expect(credits.getBalance(organizationId)).resolves.toBe(110)

        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-debit:debit',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 100 })])
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-restore:restore',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 100 })])
    })

    it('uses the provider gross total for partial tax accounting and normalizes a full remainder', async () => {
        await settlePurchase(615)
        const partial = adjustmentEvent('purchase_adjustment_debit', 'adjustment-tax-partial', 308, false)
        const fullRemainder = adjustmentEvent('purchase_adjustment_debit', 'adjustment-tax-full', 307, true)

        await handler.handle(partial)
        await expect(credits.getBalance(organizationId)).resolves.toBe(60)

        await handler.handle(fullRemainder)
        await handler.handle(partial)
        await handler.handle(fullRemainder)

        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        await expect(
            schemaDataSource.getRepository(CreditPurchase).findOneByOrFail({ id: purchase.id }),
        ).resolves.toMatchObject({ amountMinor: 500, providerTotalMinor: 615 })
        const adjustments = await schemaDataSource.getRepository(CreditPurchaseAdjustment).findBy({
            purchaseId: purchase.id,
        })
        expect(adjustments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    providerAdjustmentId: 'adjustment-tax-partial',
                    amountMinor: 308,
                    isFull: false,
                    requestedCredits: 50,
                }),
                expect.objectContaining({
                    providerAdjustmentId: 'adjustment-tax-full',
                    amountMinor: 307,
                    isFull: true,
                    requestedCredits: 50,
                }),
            ]),
        )
    })

    it('records exact shortfall, preserves strict debit behavior, and clears shortfall before restore', async () => {
        await settlePurchase()
        await credits.setBalance(organizationId, 30)

        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-shortfall'))

        await expect(credits.getBalance(organizationId)).resolves.toBe(0)
        await expect(credits.debit(organizationId, 1, 'strict-debit-after-shortfall')).rejects.toBeInstanceOf(
            InsufficientCreditsException,
        )
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-shortfall' }),
        ).resolves.toMatchObject({
            requestedCredits: 100,
            appliedDebit: 30,
            originalShortfallCredits: 70,
            shortfallCredits: 70,
            state: CreditPurchaseAdjustmentState.COMPLETED,
        })

        await handler.handle(adjustmentEvent('purchase_adjustment_restore', 'adjustment-shortfall-restore'))

        await expect(credits.getBalance(organizationId)).resolves.toBe(30)
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-shortfall' }),
        ).resolves.toMatchObject({ originalShortfallCredits: 70, shortfallCredits: 0 })
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-shortfall-restore' }),
        ).resolves.toMatchObject({
            requestedCredits: 100,
            shortfallClearedCredits: 70,
            restoredCredits: 30,
        })
    })

    it('caps two distinct partial adjustments delivered concurrently at the purchase grant', async () => {
        await settlePurchase()
        const first = adjustmentEvent('purchase_adjustment_debit', 'adjustment-partial-a', 400)
        const second = adjustmentEvent('purchase_adjustment_debit', 'adjustment-partial-b', 400)

        await Promise.all([handler.handle(first), handler.handle(second)])

        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        const adjustments = await schemaDataSource.getRepository(CreditPurchaseAdjustment).findBy({
            purchaseId: purchase.id,
        })
        expect(adjustments.reduce((sum, candidate) => sum + candidate.requestedCredits, 0)).toBe(100)
        expect(adjustments.reduce((sum, candidate) => sum + candidate.appliedDebit, 0)).toBe(100)
    })

    it('reserves cumulative partial targets while an earlier ledger operation is still blocked', async () => {
        await settlePurchase()
        const first = adjustmentEvent('purchase_adjustment_debit', 'adjustment-overlap-a', 400)
        const second = adjustmentEvent('purchase_adjustment_debit', 'adjustment-overlap-b', 400)
        const firstLedgerEntered = deferred()
        const releaseFirstLedger = deferred()
        const originalDebit = credits.debitUpTo.bind(credits)
        let isFirstCall = true
        jest.spyOn(credits, 'debitUpTo').mockImplementation(async (...args) => {
            if (isFirstCall) {
                isFirstCall = false
                firstLedgerEntered.resolve()
                await releaseFirstLedger.promise
            }
            return originalDebit(...args)
        })

        const firstHandling = handler.handle(first)
        await firstLedgerEntered.promise
        try {
            await handler.handle(second)
        } finally {
            releaseFirstLedger.resolve()
        }
        await firstHandling

        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        const adjustments = await schemaDataSource.getRepository(CreditPurchaseAdjustment).findBy({
            purchaseId: purchase.id,
        })
        expect(adjustments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ providerAdjustmentId: 'adjustment-overlap-a', requestedCredits: 80 }),
                expect.objectContaining({ providerAdjustmentId: 'adjustment-overlap-b', requestedCredits: 20 }),
            ]),
        )
    })

    it('retries an opposite-direction claim while the first ledger operation is blocked', async () => {
        await settlePurchase()
        const debit = adjustmentEvent('purchase_adjustment_debit', 'adjustment-opposite-debit')
        const restore = adjustmentEvent('purchase_adjustment_restore', 'adjustment-opposite-restore')
        const debitLedgerEntered = deferred()
        const releaseDebitLedger = deferred()
        const originalDebit = credits.debitUpTo.bind(credits)
        jest.spyOn(credits, 'debitUpTo').mockImplementationOnce(async (...args) => {
            debitLedgerEntered.resolve()
            await releaseDebitLedger.promise
            return originalDebit(...args)
        })

        const debitHandling = handler.handle(debit)
        await debitLedgerEntered.promise
        try {
            await expect(handler.handle(restore)).rejects.toBeInstanceOf(
                PaymentAdjustmentDirectionInProgressError,
            )
        } finally {
            releaseDebitLedger.resolve()
        }
        await debitHandling
        await expect(handler.handle(restore)).resolves.toBeUndefined()

        await expect(credits.getBalance(organizationId)).resolves.toBe(110)
    })

    it('applies one ledger effect when the same debit is delivered concurrently', async () => {
        await settlePurchase()
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-concurrent-replay', 250)

        await Promise.all([handler.handle(event), handler.handle(event)])

        await expect(credits.getBalance(organizationId)).resolves.toBe(60)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-concurrent-replay:debit',
            }),
        ).resolves.toHaveLength(1)
    })

    it('applies one ledger effect when the same restore is delivered concurrently', async () => {
        await settlePurchase()
        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-before-restore-replay'))
        const event = adjustmentEvent('purchase_adjustment_restore', 'adjustment-concurrent-restore')

        await Promise.all([handler.handle(event), handler.handle(event)])

        await expect(credits.getBalance(organizationId)).resolves.toBe(110)
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-concurrent-restore:restore',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 100 })])
    })

    it('converges without a debit when an inverse event is delivered first', async () => {
        await settlePurchase()

        await handler.handle(adjustmentEvent('purchase_adjustment_restore', 'adjustment-inverse-first'))
        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-debit-late'))

        await expect(credits.getBalance(organizationId)).resolves.toBe(110)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-debit-late:debit',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 0 })])
    })

    it('allows a later legitimate debit after a completed debit and restore cycle', async () => {
        await settlePurchase()

        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-cycle-debit-a'))
        await handler.handle(adjustmentEvent('purchase_adjustment_restore', 'adjustment-cycle-restore'))
        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-cycle-debit-b'))

        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
    })

    it('keeps a known adjustment retryable until the original credit grant is marked complete', async () => {
        await purchaseStore.recordPaid({
            providerReference: purchase.providerReference!,
            providerTotalMinor: 500,
            currency: 'USD',
        })
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-before-grant')

        await expect(handler.handle(event)).rejects.toThrow('has not completed its credit grant')
        await expect(
            schemaDataSource.getRepository(CreditPurchaseAdjustment).findBy({ purchaseId: purchase.id }),
        ).resolves.toHaveLength(0)

        await credits.credit(organizationId, purchase.credits, purchase.id)
        await purchaseStore.recordCreditsGranted(purchase.id)
        await expect(handler.handle(event)).resolves.toBeUndefined()
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
    })

    it('fences an adjustment racing the original paid event until its grant is complete', async () => {
        const paidEvent = {
            kind: 'purchase_paid' as const,
            providerEventId: `paid-race-${purchase.id}`,
            providerReference: purchase.providerReference!,
            providerTotalMinor: 500,
            currency: 'USD',
        }
        const adjustment = adjustmentEvent('purchase_adjustment_debit', 'adjustment-paid-race')

        await Promise.allSettled([handler.handle(paidEvent), handler.handle(adjustment)])
        await expect(handler.handle(paidEvent)).resolves.toBeUndefined()
        await expect(handler.handle(adjustment)).resolves.toBeUndefined()

        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-paid-race:debit',
            }),
        ).resolves.toHaveLength(1)
    })

    it('acknowledges an unknown adjustment purchase without creating accounting state', async () => {
        await settlePurchase()

        await expect(
            handler.handle({
                ...adjustmentEvent('purchase_adjustment_debit', 'adjustment-unknown'),
                providerReference: 'unknown-transaction',
            }),
        ).resolves.toBeUndefined()
        await expect(
            schemaDataSource.getRepository(CreditPurchaseAdjustment).findBy({ purchaseId: purchase.id }),
        ).resolves.toHaveLength(0)
        await expect(credits.getBalance(organizationId)).resolves.toBe(110)
    })

    it('retries a durable claim after credit application fails before writing a ledger entry', async () => {
        await settlePurchase()
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-credit-retry')
        const debitSpy = jest.spyOn(credits, 'debitUpTo')
        debitSpy.mockRejectedValueOnce(new Error('injected credit failure'))

        await expect(handler.handle(event)).rejects.toThrow('injected credit failure')
        await expect(credits.getBalance(organizationId)).resolves.toBe(110)
        await expect(handler.handle(event)).resolves.toBeUndefined()
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)

    })

    it('converges after the credit ledger commits but adjustment completion fails', async () => {
        await settlePurchase()
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-completion-retry')
        const completeSpy = jest.spyOn(adjustmentStore, 'complete')
        completeSpy.mockRejectedValueOnce(new Error('injected completion failure'))

        await expect(handler.handle(event)).rejects.toThrow('injected completion failure')
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        await expect(handler.handle(event)).resolves.toBeUndefined()
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-completion-retry:debit',
            }),
        ).resolves.toHaveLength(1)
    })

    it('recovers the exact shortfall after a clamped ledger debit commits before completion fails', async () => {
        await settlePurchase()
        await credits.setBalance(organizationId, 30)
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-clamped-completion-retry')
        jest.spyOn(adjustmentStore, 'complete').mockRejectedValueOnce(new Error('injected completion failure'))

        await expect(handler.handle(event)).rejects.toThrow('injected completion failure')
        await expect(credits.getBalance(organizationId)).resolves.toBe(0)
        await expect(handler.handle(event)).resolves.toBeUndefined()

        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-clamped-completion-retry' }),
        ).resolves.toMatchObject({
            appliedDebit: 30,
            originalShortfallCredits: 70,
            shortfallCredits: 70,
            state: CreditPurchaseAdjustmentState.COMPLETED,
        })
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-clamped-completion-retry:debit',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 30 })])
    })

    it('recovers a shortfall-clearing restore after its credit operation initially fails', async () => {
        await settlePurchase()
        await credits.setBalance(organizationId, 30)
        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-restore-retry-debit'))
        const restore = adjustmentEvent('purchase_adjustment_restore', 'adjustment-restore-retry')
        jest.spyOn(credits, 'creditOnce').mockRejectedValueOnce(new Error('injected restore failure'))

        await expect(handler.handle(restore)).rejects.toThrow('injected restore failure')
        await expect(credits.getBalance(organizationId)).resolves.toBe(0)
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-restore-retry-debit' }),
        ).resolves.toMatchObject({ originalShortfallCredits: 70, shortfallCredits: 0 })

        await expect(handler.handle(restore)).resolves.toBeUndefined()
        await expect(credits.getBalance(organizationId)).resolves.toBe(30)
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-restore-retry' }),
        ).resolves.toMatchObject({
            shortfallClearedCredits: 70,
            restoredCredits: 30,
            state: CreditPurchaseAdjustmentState.COMPLETED,
        })
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-restore-retry:restore',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 30 })])
    })

    it('replays a restore once when its ledger grant commits before completion fails', async () => {
        await settlePurchase()
        await credits.setBalance(organizationId, 30)
        await handler.handle(adjustmentEvent('purchase_adjustment_debit', 'adjustment-restore-completion-debit'))
        const restore = adjustmentEvent('purchase_adjustment_restore', 'adjustment-restore-completion-retry')
        jest.spyOn(adjustmentStore, 'complete').mockRejectedValueOnce(new Error('injected restore completion failure'))

        await expect(handler.handle(restore)).rejects.toThrow('injected restore completion failure')
        await expect(credits.getBalance(organizationId)).resolves.toBe(30)
        await expect(handler.handle(restore)).resolves.toBeUndefined()

        await expect(credits.getBalance(organizationId)).resolves.toBe(30)
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-restore-completion-retry:restore',
            }),
        ).resolves.toEqual([expect.objectContaining({ amount: 30 })])
        await expect(
            schemaDataSource
                .getRepository(CreditPurchaseAdjustment)
                .findOneByOrFail({ providerAdjustmentId: 'adjustment-restore-completion-retry' }),
        ).resolves.toMatchObject({
            shortfallClearedCredits: 70,
            restoredCredits: 30,
            state: CreditPurchaseAdjustmentState.COMPLETED,
        })
    })

    it('replays without another ledger effect after completion commits but the response path fails', async () => {
        await settlePurchase()
        const event = adjustmentEvent('purchase_adjustment_debit', 'adjustment-post-completion-retry')
        const originalComplete = adjustmentStore.complete.bind(adjustmentStore)
        const completeSpy = jest.spyOn(adjustmentStore, 'complete')
        completeSpy.mockImplementationOnce(async (providerAdjustmentId, appliedCredits) => {
            await originalComplete(providerAdjustmentId, appliedCredits)
            throw new Error('injected post-completion failure')
        })

        await expect(handler.handle(event)).rejects.toThrow('injected post-completion failure')
        await expect(handler.handle(event)).resolves.toBeUndefined()
        await expect(credits.getBalance(organizationId)).resolves.toBe(10)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({
                organizationId,
                reference: 'payment-adjustment:adjustment-post-completion-retry:debit',
            }),
        ).resolves.toHaveLength(1)
    })
})
