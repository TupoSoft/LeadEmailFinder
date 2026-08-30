import { CreditLedgerStore } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientCreditsException } from '../domain/credits.error'
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
        it('delegates to the store and returns the resulting balance', async () => {
            store.credit.mockResolvedValue(15)

            await expect(service.credit('org-1', 5, 'ref-1')).resolves.toBe(15)
            expect(store.credit).toHaveBeenCalledWith('org-1', 5, 'ref-1')
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

    describe('setBalance', () => {
        it('delegates to the store', async () => {
            store.setBalance.mockResolvedValue(7)

            await expect(service.setBalance('org-1', 7)).resolves.toBe(7)
            expect(store.setBalance).toHaveBeenCalledWith('org-1', 7)
        })
    })
})
