export const CREDIT_LEDGER_STORE = Symbol('CREDIT_LEDGER_STORE')

export type CreditDebitOutcome = 'applied' | 'replayed' | 'account-missing' | 'insufficient-balance'

/**
 * Atomic credit-ledger operations backing `credits`' business rules. Every mutating method locks the
 * organization's account row and is idempotent per `(organizationId, reference)`: a replayed reference never
 * repeats its effect and returns the value recorded on first application, not a recomputation.
 */
export interface CreditLedgerStore {
    /**
     * Strict, all-or-nothing debit. A replayed reference always resolves to `'replayed'`, even if the current
     * balance is now below what a fresh debit of this amount would require.
     */
    debit(organizationId: string, amount: number, reference: string): Promise<CreditDebitOutcome>

    /**
     * Debits at most the available balance (`0` through `amount`), persisting the applied amount even when it is
     * zero. A replayed reference returns the amount recorded by its first application, never recomputed.
     */
    debitUpTo(organizationId: string, amount: number, reference: string): Promise<number>

    /** Grants credits, creating the account if needed. A replayed reference returns the current balance. */
    credit(organizationId: string, amount: number, reference: string): Promise<number>

    /**
     * Grants credits once. A replayed reference returns the originally granted amount, not the current balance.
     */
    creditOnce(organizationId: string, amount: number, reference: string): Promise<number>

    getBalance(organizationId: string): Promise<number>

    setBalance(organizationId: string, amount: number): Promise<number>
}
