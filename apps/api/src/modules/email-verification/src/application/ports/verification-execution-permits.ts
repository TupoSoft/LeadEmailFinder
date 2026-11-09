export const VERIFICATION_EXECUTION_PERMITS = Symbol('VerificationExecutionPermits')

/**
 * Bounds concurrent outbound execution (SMTP probes) across sync, async, and future batch workers behind one
 * global cap, mirroring how `ProxyLeaseStore` globally bounds outbound proxy connections. `leaseId` is the same
 * id the caller uses as its execution lease owner, so one id identifies both.
 */
export interface VerificationExecutionPermits {
    /** Prunes expired permits, then admits a new one only if fewer than `maxConcurrent` remain. */
    tryAcquire(leaseId: string, organizationId: string, now: Date, expiresAt: Date, maxConcurrent: number): Promise<boolean>

    /** Extends an already-held permit's expiry. Returns false if the permit no longer exists (best-effort — a
     *  failed renewal does not itself abort the in-flight execution). */
    renew(leaseId: string, expiresAt: Date): Promise<boolean>

    /** Releases a held permit. Idempotent no-op if already absent. */
    release(leaseId: string): Promise<void>
}
