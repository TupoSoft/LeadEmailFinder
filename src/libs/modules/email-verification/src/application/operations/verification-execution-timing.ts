import { parseTimeString } from '@tuposoft/lead-email-finder/common'

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

/** How long a terminal inconclusive verdict blocks a brand-new submission for the same address before admission
 *  will try again. Not independently configurable — a fixed engineering constant, unlike the cache TTL. */
export const VERIFICATION_ADDRESS_COOLDOWN_MS = parseTimeString('60s')

/** How long `RunSynchronousVerification` drives or polls its execution inline before falling back to `202` +
 *  `Location`. The in-flight execution is never aborted at this deadline — it keeps running, backstopped by its
 *  own lease machinery and the reconciler, exactly like the async path. */
export const VERIFICATION_SYNC_EXECUTION_BUDGET_MS = parseTimeString('30s')

/** Poll cadence while waiting out a retry-scheduled attempt or another caller's in-flight execution. */
export const VERIFICATION_SYNC_POLL_INTERVAL_MS = 500
