/** Generation-fenced lease duration for one execution attempt. */
export const VERIFICATION_LEASE_DURATION_MS = 60_000

/** Renewal/liveness-poll cadence while `VerificationExecutionRunner.execute()` holds the lease. Applied for the
 *  whole probe call, since the application layer cannot observe the underlying SMTP socket's lifecycle more
 *  precisely without new plumbing this PR's scope does not include. */
export const VERIFICATION_LEASE_LIVENESS_POLL_MS = 5_000

/** Extra wait past `leaseExpiresAt` before the reconciler treats a `running` execution's lease as abandoned —
 *  a shutdown grace on top of the lease duration itself, so a holder mid-graceful-shutdown is not raced. */
export const VERIFICATION_LEASE_TAKEOVER_GRACE_MS = 5_000

/** Maximum time a single execution may stay nonterminal before the reconciler cancels it (unless a capture
 *  intention already exists, which always wins). */
export const VERIFICATION_EXECUTION_DEADLINE_MS = 24 * 60 * 60 * 1000

/** Rows fetched per reconciler sweep and per queue page. */
export const VERIFICATION_RECONCILER_PAGE_LIMIT = 100

/** Cadence at which the reconciliation queue re-schedules its own repeatable sweep job. */
export const VERIFICATION_RECONCILER_INTERVAL_MS = 30_000
