export const VERIFICATION_SUBMISSION_LIMITER = Symbol('VerificationSubmissionLimiter')

export type SubmissionLimitOutcome = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterMs: number }

/** Thrown by an adapter when it cannot determine an outcome within its own timeout — the caller must fail safe
 *  (e.g. `503`), never treat this as unlimited free admission. */
export class VerificationSubmissionLimiterUnavailableError extends Error {
    constructor(operation: string) {
        super(`Verification submission limiter did not respond to "${operation}" within the allotted timeout`)
        this.name = 'VerificationSubmissionLimiterUnavailableError'
    }
}

/** Organization-scoped token-bucket submission limiter. Counts every POST submission, including free outcomes —
 *  callers must consult this before admission, not instead of it. */
export interface VerificationSubmissionLimiter {
    tryConsume(organizationId: string, now: number, capacity: number, refillPerSecond: number): Promise<SubmissionLimitOutcome>
}
