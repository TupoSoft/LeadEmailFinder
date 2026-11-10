import { parseTimeString } from '@tuposoft/lead-email-finder/common'

/** Lease duration and renewal cadence for API-owned batch admission. */
export const VERIFICATION_LEASE_DURATION_MS = 60_000
export const VERIFICATION_LEASE_LIVENESS_POLL_MS = 5_000

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
