import { CreditBalanceSnapshot, CreditLedgerStore } from '@tuposoft/lead-email-finder/modules/identity'
import {
    BalanceBelowReservedException,
    CreditIdempotencyConflict,
    InsufficientCreditsException,
} from '../domain/credits.error'

export class CreditsService {
    constructor(private readonly store: CreditLedgerStore) {}

    async debit(organizationId: string, amount: number, reference: string): Promise<void> {
        const outcome = await this.store.debit(organizationId, amount, reference)
        if (outcome === 'account-missing' || outcome === 'insufficient-balance') {
            throw new InsufficientCreditsException(organizationId)
        }
    }

    async debitUpTo(organizationId: string, amount: number, reference: string): Promise<number> {
        this.assertNonNegativeInteger(amount)
        return this.store.debitUpTo(organizationId, amount, reference)
    }

    async credit(organizationId: string, amount: number, reference: string): Promise<number> {
        const result = await this.store.credit(organizationId, amount, reference)
        return result.balance
    }

    async addPlatformCredits(organizationId: string, amount: number, idempotencyKey: string): Promise<number> {
        const result = await this.store.credit(organizationId, amount, `platform-credit-add:${idempotencyKey}`)

        if (result.disposition === 'existing' && result.recordedAmount !== amount) {
            throw new CreditIdempotencyConflict()
        }

        return result.balance
    }

    async creditOnce(organizationId: string, amount: number, reference: string): Promise<number> {
        this.assertNonNegativeInteger(amount)
        return this.store.creditOnce(organizationId, amount, reference)
    }

    async getBalance(organizationId: string): Promise<number> {
        return this.store.getBalance(organizationId)
    }

    async getBalanceSnapshot(organizationId: string): Promise<CreditBalanceSnapshot & { available: number }> {
        const { balance, reserved } = await this.store.getBalanceSnapshot(organizationId)
        return { balance, reserved, available: balance - reserved }
    }

    async setBalance(organizationId: string, amount: number): Promise<number> {
        const outcome = await this.store.setBalance(organizationId, amount)
        if (outcome.kind === 'below-reserved') {
            throw new BalanceBelowReservedException(organizationId)
        }
        return outcome.balance
    }

    private assertNonNegativeInteger(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error('Credit amount must be a non-negative safe integer')
        }
    }
}
