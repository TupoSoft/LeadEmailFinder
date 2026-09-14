import { VerificationAdmissionService } from '../../operations/verification-admission.service'
import { VerificationOperationsReader } from '../../operations/verification-operations-reader'
import { VerificationExecutionDispatcher } from '../../ports/verification-execution-dispatcher'
import { AsyncVerificationStatus, mapAsyncVerificationStatus } from './async-verification-status'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'

export const ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN = 'AsyncEmailVerificationServiceToken'

export interface VerifyAsyncInput {
    readonly organizationId: string
    readonly email: string
    readonly clientRequestKey?: string
}

export type VerifyAsyncOutcome =
    | { readonly kind: 'accepted'; readonly id: string }
    | { readonly kind: 'insufficient-funds'; readonly id: string }
    | { readonly kind: 'conflict'; readonly reason: 'key-mismatch' | 'key-expired' }
    | { readonly kind: 'address-cooldown'; readonly retryAfterMs: number }

/**
 * Drives the async submission and status-read routes through the durable admission/execution/settlement stack.
 * `verifyAsync` dispatches a `funded`/`joined` outcome onto the `verification-execution` queue (idempotent — the
 * dispatcher keys the job by execution ID); a `cooldown` outcome (joined an execution already `awaiting_retry`)
 * is deliberately not redispatched here, relying on the reconciler's own cadence instead. `getAsyncVerificationState`
 * reuses the existing `AsyncEmailVerificationJobNotFoundException`/404 contract for a missing, foreign, or
 * expired operation, so the controller's existing catch-and-404 logic is unchanged.
 */
export class AsyncEmailVerificationService {
    constructor(
        private readonly admission: VerificationAdmissionService,
        private readonly dispatcher: VerificationExecutionDispatcher,
        private readonly operations: VerificationOperationsReader,
        private readonly cacheTtlMs: number,
    ) {}

    async verifyAsync(input: VerifyAsyncInput): Promise<VerifyAsyncOutcome> {
        const outcome = await this.admission.admit({
            organizationId: input.organizationId,
            email: input.email,
            deliveryMode: 'async',
            clientRequestKey: input.clientRequestKey,
        })

        switch (outcome.kind) {
            case 'cached':
                return { kind: 'accepted', id: outcome.requestId }
            case 'funded':
            case 'joined':
                await this.dispatcher.dispatch(outcome.executionId, input.organizationId)
                return { kind: 'accepted', id: outcome.requestId }
            case 'cooldown':
                return { kind: 'accepted', id: outcome.requestId }
            case 'address-cooldown':
                return { kind: 'address-cooldown', retryAfterMs: outcome.retryAfterMs }
            case 'insufficient-funds':
                return { kind: 'insufficient-funds', id: outcome.requestId }
            case 'conflict':
                return { kind: 'conflict', reason: outcome.reason }
        }
    }

    async getAsyncVerificationState(requestId: string, organizationId: string): Promise<AsyncVerificationStatus> {
        const outcome = await this.operations.read(requestId, organizationId)
        if (outcome.kind === 'not-found' || outcome.kind === 'expired') {
            throw new AsyncEmailVerificationJobNotFoundException(requestId)
        }
        return mapAsyncVerificationStatus(outcome, this.cacheTtlMs)
    }
}
