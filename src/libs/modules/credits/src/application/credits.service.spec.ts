import { CreditLedgerStore } from '@tuposoft/lead-email-finder/modules/identity'
import {
    BalanceBelowReservedException,
    CreditIdempotencyConflict,
    InsufficientCreditsException,
} from '../domain/credits.error'
import { CreditsService } from './credits.service'

describe('CreditsService', () => {
    let store: jest.Mocked<CreditLedgerStore>
    let service: CreditsService

    beforeEach(() => {
        store = {
            debit: jest.fn(),
            debitUpTo: jest.fn(),
            credit: jest.fn(),
            creditOnce: jest.fn(),
            getBalance: jest.fn(),
            getBalanceSnapshot: jest.fn(),
            setBalance: jest.fn(),
        }
        service = new CreditsService(store)
    })

    describe('debit', () => {
        it('resolves without throwing when the store reports applied', async () => {
            store.debit.mockResolvedValue('applied')

            await expect(service.debit('org-1', 3, 'ref-1')).resolves.toBeUndefined()
            expect(store.debit).toHaveBeenCalledWith('org-1', 3, 'ref-1')
        })

        it('resolves without throwing when the store reports a replay', async () => {
            store.debit.mockResolvedValue('replayed')

            await expect(service.debit('org-1', 3, 'ref-1')).resolves.toBeUndefined()
        })

        it('throws InsufficientCreditsException when the store reports insufficient-balance', async () => {
            store.debit.mockResolvedValue('insufficient-balance')

            await expect(service.debit('org-1', 3, 'ref-1')).rejects.toThrow(InsufficientCreditsException)
        })

        it('throws InsufficientCreditsException when the store reports account-missing', async () => {
            store.debit.mockResolvedValue('account-missing')

            await expect(service.debit('org-1', 1, 'ref-1')).rejects.toThrow(InsufficientCreditsException)
        })
    })

    describe('debitUpTo', () => {
        it('delegates to the store and returns the applied amount', async () => {
            store.debitUpTo.mockResolvedValue(3)

            await expect(service.debitUpTo('org-1', 10, 'adjustment-1')).resolves.toBe(3)
            expect(store.debitUpTo).toHaveBeenCalledWith('org-1', 10, 'adjustment-1')
        })

        it('rejects a negative amount without calling the store', async () => {
            await expect(service.debitUpTo('org-1', -1, 'adjustment-1')).rejects.toThrow(
                'Credit amount must be a non-negative safe integer',
            )
            expect(store.debitUpTo).not.toHaveBeenCalled()
        })

        it('rejects a non-integer amount without calling the store', async () => {
            await expect(service.debitUpTo('org-1', 1.5, 'adjustment-1')).rejects.toThrow(
                'Credit amount must be a non-negative safe integer',
            )
            expect(store.debitUpTo).not.toHaveBeenCalled()
        })
    })

    describe('credit', () => {
        it.each(['inserted', 'existing'] as const)(
            'returns the balance for %s without applying platform amount-conflict policy',
            async disposition => {
                store.credit.mockResolvedValue({ disposition, recordedAmount: 10, balance: 15 })

                await expect(service.credit('org-1', 5, 'payment:ref-1')).resolves.toBe(15)
                expect(store.credit).toHaveBeenCalledWith('org-1', 5, 'payment:ref-1')
            },
        )
    })

    describe('addPlatformCredits', () => {
        const key = '841668a4-3ba2-4a6d-92a9-969bd60c5121'

        it.each(['inserted', 'existing'] as const)('returns the authoritative balance for %s', async disposition => {
            store.credit.mockResolvedValue({ disposition, recordedAmount: 5, balance: 23 })

            await expect(service.addPlatformCredits('org-1', 5, key)).resolves.toBe(23)
            expect(store.credit).toHaveBeenCalledWith('org-1', 5, `platform-credit-add:${key}`)
        })

        it('rejects an existing reference with a different amount', async () => {
            store.credit.mockResolvedValue({ disposition: 'existing', recordedAmount: 5, balance: 23 })

            await expect(service.addPlatformCredits('org-1', 9, key)).rejects.toThrow(CreditIdempotencyConflict)
            expect(store.credit).toHaveBeenCalledTimes(1)
            expect(store.setBalance).not.toHaveBeenCalled()
        })

        it('preserves a storage failure instead of treating it as replay', async () => {
            const failure = new Error('ledger unavailable')
            store.credit.mockRejectedValue(failure)

            await expect(service.addPlatformCredits('org-1', 5, key)).rejects.toBe(failure)
        })
    })

    describe('creditOnce', () => {
        it('delegates to the store and returns the applied amount', async () => {
            store.creditOnce.mockResolvedValue(7)

            await expect(service.creditOnce('org-1', 7, 'restore-1')).resolves.toBe(7)
            expect(store.creditOnce).toHaveBeenCalledWith('org-1', 7, 'restore-1')
        })

        it('rejects a negative amount without calling the store', async () => {
            await expect(service.creditOnce('org-1', -1, 'restore-1')).rejects.toThrow(
                'Credit amount must be a non-negative safe integer',
            )
            expect(store.creditOnce).not.toHaveBeenCalled()
        })
    })

    describe('getBalance', () => {
        it('delegates to the store', async () => {
            store.getBalance.mockResolvedValue(42)

            await expect(service.getBalance('org-1')).resolves.toBe(42)
            expect(store.getBalance).toHaveBeenCalledWith('org-1')
        })
    })

    describe('getBalanceSnapshot', () => {
        it('derives available credits from one consistent snapshot read', async () => {
            store.getBalanceSnapshot.mockResolvedValue({ balance: 10, reserved: 3 })

            await expect(service.getBalanceSnapshot('org-1')).resolves.toEqual({
                balance: 10,
                reserved: 3,
                available: 7,
            })
            expect(store.getBalanceSnapshot).toHaveBeenCalledWith('org-1')
        })
    })

    describe('setBalance', () => {
        it('delegates to the store and returns the applied balance', async () => {
            store.setBalance.mockResolvedValue({ kind: 'applied', balance: 7 })

            await expect(service.setBalance('org-1', 7)).resolves.toBe(7)
            expect(store.setBalance).toHaveBeenCalledWith('org-1', 7)
        })

        it('throws BalanceBelowReservedException when the store rejects a target below reserved', async () => {
            store.setBalance.mockResolvedValue({ kind: 'below-reserved' })

            await expect(service.setBalance('org-1', 2)).rejects.toBeInstanceOf(BalanceBelowReservedException)
        })
    })
})
