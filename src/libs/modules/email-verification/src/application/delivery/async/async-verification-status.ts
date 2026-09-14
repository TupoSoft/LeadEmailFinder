import { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { ReadOutcome } from '../../operations/verification-operations-reader'
import { buildOperationMetadata, VerificationOperationMetadata } from '../../operations/verification-operation-metadata'
import { VerificationExecutionState } from '../../ports/verification-execution-store'
import { VerificationResultDetail } from '../../verification-result-reader'

export type AsyncVerificationResult = Omit<IEmailVerificationResponseDto, 'createdAt'>

export type AsyncVerificationStatus =
    | { state: 'queued' }
    | { state: 'running' }
    | { state: 'completed'; result: AsyncVerificationResult; operation: VerificationOperationMetadata }
    | { state: 'failed'; failureCode: 'verification_failed'; operation: VerificationOperationMetadata }
    | { state: 'unavailable' }

/** Nonterminal execution states never surface as a sixth public status value — the browser frontend's status
 *  vocabulary is fixed at `queued|running|completed|failed|unavailable` and adding a new value would break its
 *  type-checked per-state copy. `settling` (result already persisted, settlement not yet confirmed) still reads
 *  as `running`, since the operation is not yet actually done from the caller's perspective. */
const EXECUTION_STATE_TO_PUBLIC_STATE: Record<VerificationExecutionState, 'queued' | 'running'> = {
    funding_pending: 'queued',
    queued: 'queued',
    awaiting_retry: 'queued',
    running: 'running',
    settling: 'running',
    completed: 'running',
    canceled: 'running',
}

function toAsyncResult(result: VerificationResultDetail): AsyncVerificationResult {
    return {
        id: result.id,
        email: result.email,
        localPart: result.localPart,
        domain: result.domain,
        exists: result.exists,
        catchAll: result.catchAll,
        reason: result.reason,
        sources: result.sources,
        ...(result.format !== undefined ? { format: result.format } : {}),
        ...(result.mxDomain !== undefined ? { mxDomain: result.mxDomain } : {}),
        ...(result.targetExchange !== undefined ? { targetExchange: result.targetExchange } : {}),
    }
}

/** Maps durable request/execution state (not a BullMQ job snapshot) to the existing five-value public status
 *  vocabulary, now also carrying the additive `operation` metadata block once settled. `not-found`/`expired`
 *  outcomes are the caller's responsibility (a 404), never mapped here. */
export function mapAsyncVerificationStatus(outcome: ReadOutcome, cacheTtlMs: number): AsyncVerificationStatus {
    switch (outcome.kind) {
        case 'pending':
            return { state: EXECUTION_STATE_TO_PUBLIC_STATE[outcome.executionState] }
        case 'settled': {
            const evidenceObservedAt = outcome.result?.evidenceObservedAt ?? null
            const operation = buildOperationMetadata(outcome.request, evidenceObservedAt, cacheTtlMs)
            return outcome.result
                ? { state: 'completed', result: toAsyncResult(outcome.result), operation }
                : { state: 'failed', failureCode: 'verification_failed', operation }
        }
        case 'not-found':
        case 'expired':
            return { state: 'unavailable' }
    }
}
