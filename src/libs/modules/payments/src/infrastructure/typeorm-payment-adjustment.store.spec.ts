import { DataSource, EntityManager } from 'typeorm'
import {
    CreditPurchaseAdjustment,
    CreditPurchaseAdjustmentDirection,
    CreditPurchaseAdjustmentState,
} from '../credit-purchase-adjustment.entity'
import { CreditPurchase, CreditPurchaseStatus } from '../credit-purchase.entity'
import {
    PaymentAdjustmentBasisMissingError,
    PaymentAdjustmentCurrencyMismatchError,
    PaymentAdjustmentDirection,
    PaymentAdjustmentDirectionInProgressError,
    PaymentAdjustmentPurchaseNotReadyError,
    PaymentAdjustmentReplayConflictError,
} from '../payment-adjustment.store'
import { TypeOrmPaymentAdjustmentStore } from './typeorm-payment-adjustment.store'

const purchase = {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    providerReference: 'transaction-1',
    status: CreditPurchaseStatus.PAID,
    creditsGrantedAt: new Date(),
    credits: 100,
    amountMinor: 500,
    providerTotalMinor: 500,
    currency: 'USD',
} as CreditPurchase

const debitInput = {
    providerEventId: 'event-1',
    providerReference: purchase.providerReference!,
    providerAdjustmentId: 'adjustment-1',
    direction: PaymentAdjustmentDirection.DEBIT,
    amountMinor: 407,
    isFull: true,
    currency: 'USD',
}

function adjustment(
    overrides: Partial<CreditPurchaseAdjustment> = {},
): CreditPurchaseAdjustment {
    return {
        providerAdjustmentId: debitInput.providerAdjustmentId,
        purchaseId: purchase.id,
        providerEventId: debitInput.providerEventId,
        direction: CreditPurchaseAdjustmentDirection.DEBIT,
        amountMinor: 407,
        isFull: true,
        effectiveAmountMinor: 500,
        currency: 'USD',
        requestedCredits: 100,
        operationCredits: 100,
        appliedDebit: 0,
        restoredCredits: 0,
        originalShortfallCredits: 0,
        shortfallCredits: 0,
        shortfallClearedCredits: 0,
        state: CreditPurchaseAdjustmentState.CLAIMED,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as CreditPurchaseAdjustment
}

describe('TypeOrmPaymentAdjustmentStore', () => {
    let manager: {
        findOne: jest.Mock
        findOneBy: jest.Mock
        find: jest.Mock
        save: jest.Mock
    }
    let store: TypeOrmPaymentAdjustmentStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn((_entity: unknown, value: unknown): Promise<unknown> => Promise.resolve(value)),
        }
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmPaymentAdjustmentStore({ transaction } as unknown as DataSource)
    })

    it('locks a settled purchase and persists a deterministic full debit claim', async () => {
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(null)

        await expect(store.claim(debitInput)).resolves.toEqual({
            providerAdjustmentId: debitInput.providerAdjustmentId,
            organizationId: purchase.organizationId,
            direction: PaymentAdjustmentDirection.DEBIT,
            operationCredits: 100,
            ledgerReference: 'payment-adjustment:adjustment-1:debit',
            completed: false,
        })
        expect(manager.findOne).toHaveBeenNthCalledWith(1, CreditPurchase, {
            where: { providerReference: purchase.providerReference },
            lock: { mode: 'pessimistic_write' },
        })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            expect.objectContaining({
                amountMinor: 407,
                isFull: true,
                effectiveAmountMinor: 500,
                requestedCredits: 100,
                operationCredits: 100,
                state: CreditPurchaseAdjustmentState.CLAIMED,
            }),
        )
    })

    it('returns null for an unknown provider transaction', async () => {
        manager.findOne.mockResolvedValue(null)

        await expect(store.claim(debitInput)).resolves.toBeNull()

        expect(manager.find).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('keeps an adjustment retryable until the original purchase grant is complete', async () => {
        manager.findOne.mockResolvedValue({ ...purchase, creditsGrantedAt: null } as CreditPurchase)

        await expect(store.claim(debitInput)).rejects.toBeInstanceOf(PaymentAdjustmentPurchaseNotReadyError)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('keeps an adjustment retryable until the paid provider total is known', async () => {
        manager.findOne.mockResolvedValue({ ...purchase, providerTotalMinor: null } as CreditPurchase)

        await expect(store.claim(debitInput)).rejects.toBeInstanceOf(PaymentAdjustmentBasisMissingError)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects an adjustment currency that differs from the stored purchase', async () => {
        manager.findOne.mockResolvedValue(purchase)

        await expect(store.claim({ ...debitInput, currency: 'EUR' })).rejects.toBeInstanceOf(
            PaymentAdjustmentCurrencyMismatchError,
        )
    })

    it('returns an existing completed claim without recalculation or persistence', async () => {
        const existing = adjustment({ state: CreditPurchaseAdjustmentState.COMPLETED, appliedDebit: 100 })
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(existing)

        await expect(store.claim(debitInput)).resolves.toMatchObject({ completed: true, operationCredits: 100 })

        expect(manager.find).not.toHaveBeenCalled()
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects replayed financial details that differ for the same provider adjustment id', async () => {
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(adjustment())

        await expect(store.claim({ ...debitInput, amountMinor: 499 })).rejects.toBeInstanceOf(
            PaymentAdjustmentReplayConflictError,
        )
    })

    it('rejects a replay whose full-adjustment scope differs', async () => {
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(adjustment())

        await expect(store.claim({ ...debitInput, isFull: false })).rejects.toBeInstanceOf(
            PaymentAdjustmentReplayConflictError,
        )
    })

    it('uses the provider total rather than the catalog amount for partial accounting', async () => {
        manager.findOne
            .mockResolvedValueOnce({ ...purchase, providerTotalMinor: 615 } as CreditPurchase)
            .mockResolvedValueOnce(null)

        await expect(
            store.claim({ ...debitInput, amountMinor: 308, isFull: false }),
        ).resolves.toMatchObject({ operationCredits: 50 })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            expect.objectContaining({
                amountMinor: 308,
                isFull: false,
                effectiveAmountMinor: 308,
                requestedCredits: 50,
            }),
        )
    })

    it('blocks a restore while a debit credit operation is incomplete', async () => {
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(null)
        manager.find.mockResolvedValue([adjustment()])

        await expect(
            store.claim({
                ...debitInput,
                providerAdjustmentId: 'restore-1',
                direction: PaymentAdjustmentDirection.RESTORE,
            }),
        ).rejects.toBeInstanceOf(PaymentAdjustmentDirectionInProgressError)
    })

    it('reserves a restore by clearing outstanding shortfall before crediting applied debits', async () => {
        const debit = adjustment({
            state: CreditPurchaseAdjustmentState.COMPLETED,
            appliedDebit: 30,
            originalShortfallCredits: 70,
            shortfallCredits: 70,
        })
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(null)
        manager.find.mockResolvedValue([debit])

        await expect(
            store.claim({
                ...debitInput,
                providerAdjustmentId: 'restore-1',
                direction: PaymentAdjustmentDirection.RESTORE,
            }),
        ).resolves.toMatchObject({
            direction: PaymentAdjustmentDirection.RESTORE,
            operationCredits: 30,
        })
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            [expect.objectContaining({ providerAdjustmentId: debit.providerAdjustmentId, shortfallCredits: 0 })],
        )
        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            expect.objectContaining({
                providerAdjustmentId: 'restore-1',
                requestedCredits: 100,
                operationCredits: 30,
                shortfallClearedCredits: 70,
            }),
        )
    })

    it('completes a clamped debit while preserving original and outstanding shortfall', async () => {
        const claimed = adjustment()
        manager.findOneBy.mockResolvedValue(claimed)
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(claimed)

        await store.complete(claimed.providerAdjustmentId, 30)

        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            expect.objectContaining({
                appliedDebit: 30,
                originalShortfallCredits: 70,
                shortfallCredits: 70,
                state: CreditPurchaseAdjustmentState.COMPLETED,
            }),
        )
    })

    it('completes a restore only when the full reserved credit operation was applied', async () => {
        const claimed = adjustment({
            providerAdjustmentId: 'restore-1',
            direction: CreditPurchaseAdjustmentDirection.RESTORE,
            operationCredits: 30,
            requestedCredits: 100,
            shortfallClearedCredits: 70,
        })
        manager.findOneBy.mockResolvedValue(claimed)
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(claimed)

        await store.complete(claimed.providerAdjustmentId, 30)

        expect(manager.save).toHaveBeenCalledWith(
            CreditPurchaseAdjustment,
            expect.objectContaining({ restoredCredits: 30, state: CreditPurchaseAdjustmentState.COMPLETED }),
        )
    })

    it('rejects a completed replay whose ledger result differs from the recorded debit', async () => {
        const completed = adjustment({
            state: CreditPurchaseAdjustmentState.COMPLETED,
            appliedDebit: 30,
            originalShortfallCredits: 70,
            shortfallCredits: 70,
        })
        manager.findOneBy.mockResolvedValue(completed)
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(completed)

        await expect(store.complete(completed.providerAdjustmentId, 31)).rejects.toBeInstanceOf(
            PaymentAdjustmentReplayConflictError,
        )

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects a debit result larger than the operation reserved by its claim', async () => {
        const claimed = adjustment({ operationCredits: 30, requestedCredits: 30 })
        manager.findOneBy.mockResolvedValue(claimed)
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(claimed)

        await expect(store.complete(claimed.providerAdjustmentId, 31)).rejects.toThrow(
            'applied more credits than claimed',
        )

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects a restore completion that did not apply the full reserved amount', async () => {
        const claimed = adjustment({
            providerAdjustmentId: 'restore-1',
            direction: CreditPurchaseAdjustmentDirection.RESTORE,
            operationCredits: 30,
            requestedCredits: 100,
            shortfallClearedCredits: 70,
        })
        manager.findOneBy.mockResolvedValue(claimed)
        manager.findOne.mockResolvedValueOnce(purchase).mockResolvedValueOnce(claimed)

        await expect(store.complete(claimed.providerAdjustmentId, 29)).rejects.toThrow(
            'did not restore its claimed credits',
        )

        expect(manager.save).not.toHaveBeenCalled()
    })
})
