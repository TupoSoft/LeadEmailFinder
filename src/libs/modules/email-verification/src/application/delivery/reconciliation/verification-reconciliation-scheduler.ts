export const VERIFICATION_RECONCILIATION_SCHEDULER = Symbol('VerificationReconciliationScheduler')

/** Idempotently ensures the periodic reconciliation sweep is scheduled at the given cadence. Safe to call on
 *  every application bootstrap — re-registering the same schedule is a no-op, not a duplicate. */
export interface VerificationReconciliationScheduler {
    ensureScheduled(intervalMs: number): Promise<void>
}
