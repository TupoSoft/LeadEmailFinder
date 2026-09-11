export const CREDIT_LEDGER_STORE = Symbol('CREDIT_LEDGER_STORE')

export type CreditDebitOutcome = 'applied' | 'replayed' | 'account-missing' | 'insufficient-balance'

export type CreditGrantPersistenceResult = {
    readonly disposition: 'inserted' | 'existing'
    readonly recordedAmount: number
    readonly balance: number
}

/** One consistent read of both fields from a single account row; never combine two separate reads. */
export type CreditBalanceSnapshot = {
    readonly balance: number
    readonly reserved: number
}

export type SetBalanceOutcome =
    | { readonly kind: 'applied'; readonly balance: number }
    | { readonly kind: 'below-reserved' }

/**
 * Atomic credit-ledger operations backing `credits`' business rules. Referenced operations are idempotent per
 * `(organizationId, reference)`: a replayed reference never repeats its effect. Grant results distinguish the
 * amount recorded on first application from the account's current balance; callers own replay policy.
 */
export interface CreditLedgerStore {
    /**
     * Strict, all-or-nothing debit against `balance - reserved`. A replayed reference always resolves to
     * `'replayed'`, even if the current available balance is now below what a fresh debit would require.
     */
    debit(organizationId: string, amount: number, reference: string): Promise<CreditDebitOutcome>

    /**
     * Debits at most the available balance (`balance - reserved`, from `0` through `amount`), persisting the
     * applied amount even when it is zero. A replayed reference returns the amount recorded by its first
     * application, never recomputed, so a later top-up or release cannot let it charge again.
     */
    debitUpTo(organizationId: string, amount: number, reference: string): Promise<number>

    /** Grants credits, creating and locking the account if needed, and reports immutable persistence facts. */
    credit(organizationId: string, amount: number, reference: string): Promise<CreditGrantPersistenceResult>

    /**
     * Grants credits once. A replayed reference returns the originally granted amount, not the current balance.
     */
    creditOnce(organizationId: string, amount: number, reference: string): Promise<number>

    getBalance(organizationId: string): Promise<number>

    /** One consistent snapshot of total balance and reserved credits from a single account read. */
    getBalanceSnapshot(organizationId: string): Promise<CreditBalanceSnapshot>

    /**
     * Replaces the absolute total balance under the same account lock as every other mutation. Rejects a target
     * below currently reserved credits without writing, since an administrative overwrite must not invalidate
     * funding already promised to accepted operations.
     */
    setBalance(organizationId: string, amount: number): Promise<SetBalanceOutcome>
}
