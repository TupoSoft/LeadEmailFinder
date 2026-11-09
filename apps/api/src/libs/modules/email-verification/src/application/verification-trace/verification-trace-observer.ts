import { EmailVerificationReason, VerificationTraceContext } from '@tuposoft/lead-email-finder/common'

export const VERIFICATION_TRACE_OBSERVER = Symbol('VerificationTraceObserver')

export type VerificationFailureStage =
    | 'domain_policy'
    | 'email_cache_prepare'
    | 'verification_probe'
    | 'verification_persist'
    | 'email_cache_finalize'
    | 'queue_dispatch'
    | 'batch_validation'
    | 'batch_result_publication'

export interface VerificationTraceObserver {
    enqueued(event: { requestId: string; mode: 'async' | 'batch'; jobId: string }): void
    completed(
        event: VerificationTraceContext & {
            verificationId: string
            reason: EmailVerificationReason
            durationMs: number
        },
    ): void
    batchCompleted(event: {
        batchId: string
        total: number
        processed: number
        unprocessed: number
        durationMs: number
    }): void
    failed(
        event: VerificationTraceContext & {
            stage: VerificationFailureStage
            errorType: string
            durationMs: number
        },
    ): void
}

export const NOOP_VERIFICATION_TRACE_OBSERVER: VerificationTraceObserver = {
    enqueued: () => undefined,
    completed: () => undefined,
    batchCompleted: () => undefined,
    failed: () => undefined,
}

export function observeSafely(observe: () => void): void {
    try {
        observe()
    } catch {
        // Telemetry must never change verification, persistence, credit, or queue outcomes.
    }
}
