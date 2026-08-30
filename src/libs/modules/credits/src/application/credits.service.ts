import { CreditLedgerStore } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientCreditsException } from '../domain/credits.error'

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
        return this.store.credit(organizationId, amount, reference)
    }

    async creditOnce(organizationId: string, amount: number, reference: string): Promise<number> {
        this.assertNonNegativeInteger(amount)
        return this.store.creditOnce(organizationId, amount, reference)
    }

    async getBalance(organizationId: string): Promise<number> {
        return this.store.getBalance(organizationId)
    }

    async setBalance(organizationId: string, amount: number): Promise<number> {
        return this.store.setBalance(organizationId, amount)
    }

    private assertNonNegativeInteger(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error('Credit amount must be a non-negative safe integer')
        }
    }
}
