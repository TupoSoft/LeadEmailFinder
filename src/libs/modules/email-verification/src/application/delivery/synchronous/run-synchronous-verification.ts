import { VerificationAdmissionService } from '../../operations/verification-admission.service'
import { VerificationExecutionRunner } from '../../operations/verification-execution-runner'
import { ReadOutcome, VerificationOperationsReader } from '../../operations/verification-operations-reader'
import { buildOperationMetadata, VerificationOperationMetadata } from '../../operations/verification-operation-metadata'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationResultDetail } from '../../verification-result-reader'

export const RUN_SYNCHRONOUS_VERIFICATION = Symbol('RUN_SYNCHRONOUS_VERIFICATION')

export interface SynchronousVerificationCommand {
    readonly organizationId: string
    readonly email: string
    readonly clientRequestKey?: string
}

export type SynchronousVerificationOutcome =
    | { readonly kind: 'completed'; readonly result: VerificationResultDetail; readonly operation: VerificationOperationMetadata }
    | { readonly kind: 'failed'; readonly operation: VerificationOperationMetadata }
    | { readonly kind: 'accepted'; readonly id: string }
    | { readonly kind: 'insufficient-funds' }
    | { readonly kind: 'conflict'; readonly reason: 'key-mismatch' | 'key-expired' }
    | { readonly kind: 'address-cooldown'; readonly retryAfterMs: number }

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Admits one email through the same durable stack the async route uses, then drives it to a result inline
 * whenever it is this call's own execution to drive — never someone else's. A `funded` admission runs
 * `VerificationExecutionRunner.execute()` in a loop, waiting out a scheduled retry only if it still fits the
 * budget; a `joined`/`cooldown` admission polls read-only status instead, since driving another caller's
 * execution inline would race its own lease. Exhausting the budget (or losing the race entirely — `lease-lost`/
 * `not-runnable`) falls back to `accepted`, exactly like the async path: the execution keeps running, backstopped
 * by its own lease machinery and the reconciler, and the caller can poll `GET /verifyAsync/:id` for the outcome.
 * A connection closed by the caller never affects this — only durable state drives billing.
 */
export class RunSynchronousVerification {
    constructor(
        private readonly admission: VerificationAdmissionService,
        private readonly runner: VerificationExecutionRunner,
        private readonly operations: VerificationOperationsReader,
        private readonly clock: VerificationClock,
        private readonly budgetMs: number,
        private readonly pollIntervalMs: number,
        private readonly cacheTtlMs: number,
    ) {}

    async execute(command: SynchronousVerificationCommand): Promise<SynchronousVerificationOutcome> {
        const outcome = await this.admission.admit({
            organizationId: command.organizationId,
            email: command.email,
            deliveryMode: 'sync',
            clientRequestKey: command.clientRequestKey,
        })

        switch (outcome.kind) {
            case 'insufficient-funds':
                return { kind: 'insufficient-funds' }
            case 'conflict':
                return { kind: 'conflict', reason: outcome.reason }
            case 'address-cooldown':
                return { kind: 'address-cooldown', retryAfterMs: outcome.retryAfterMs }
            case 'cached':
                return this.readSettledOrFallBack(outcome.requestId, command.organizationId)
            case 'funded':
                return this.driveInline(outcome.requestId, outcome.executionId, command.organizationId)
            case 'joined':
            case 'cooldown':
                return this.pollUntilSettled(outcome.requestId, command.organizationId)
        }
    }

    private async driveInline(
        requestId: string,
        executionId: string,
        organizationId: string,
    ): Promise<SynchronousVerificationOutcome> {
        const deadlineMs = this.clock.now().getTime() + this.budgetMs

        while (this.clock.now().getTime() < deadlineMs) {
            const executionOutcome = await this.runner.execute(executionId, organizationId)

            if (executionOutcome.kind === 'settled') {
                return this.readSettledOrFallBack(requestId, organizationId)
            }
            if (executionOutcome.kind === 'lease-lost' || executionOutcome.kind === 'not-runnable') {
                return { kind: 'accepted', id: requestId }
            }
            if (executionOutcome.kind === 'permit-unavailable') {
                await sleep(Math.min(this.pollIntervalMs, Math.max(0, deadlineMs - this.clock.now().getTime())))
                continue
            }

            const waitMs = executionOutcome.retryAt.getTime() - this.clock.now().getTime()
            if (waitMs > 0) {
                if (this.clock.now().getTime() + waitMs >= deadlineMs) break
                await sleep(waitMs)
            }
        }

        return { kind: 'accepted', id: requestId }
    }

    private async pollUntilSettled(requestId: string, organizationId: string): Promise<SynchronousVerificationOutcome> {
        const deadlineMs = this.clock.now().getTime() + this.budgetMs

        while (this.clock.now().getTime() < deadlineMs) {
            const read = await this.operations.read(requestId, organizationId)
            if (read.kind === 'settled') return RunSynchronousVerification.toOutcome(read, this.cacheTtlMs)
            if (read.kind === 'not-found' || read.kind === 'expired') return { kind: 'accepted', id: requestId }
            await sleep(Math.min(this.pollIntervalMs, Math.max(0, deadlineMs - this.clock.now().getTime())))
        }

        return { kind: 'accepted', id: requestId }
    }

    private async readSettledOrFallBack(requestId: string, organizationId: string): Promise<SynchronousVerificationOutcome> {
        const read = await this.operations.read(requestId, organizationId)
        if (read.kind !== 'settled') return { kind: 'accepted', id: requestId }
        return RunSynchronousVerification.toOutcome(read, this.cacheTtlMs)
    }

    private static toOutcome(
        read: Extract<ReadOutcome, { kind: 'settled' }>,
        cacheTtlMs: number,
    ): SynchronousVerificationOutcome {
        const evidenceObservedAt = read.result?.evidenceObservedAt ?? null
        const operation = buildOperationMetadata(read.request, evidenceObservedAt, cacheTtlMs)
        return read.result ? { kind: 'completed', result: read.result, operation } : { kind: 'failed', operation }
    }
}
