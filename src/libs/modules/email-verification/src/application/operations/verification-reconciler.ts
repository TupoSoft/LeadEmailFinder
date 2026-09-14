import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionRecord, VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationRequestStore } from '../ports/verification-request-store'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'
import { VerificationExecutionRunner } from './verification-execution-runner'
import { VerificationSettlementService } from './verification-settlement.service'

export interface VerificationReconcileReport {
    readonly executionsChecked: number
    readonly intentionsSettled: number
}

/**
 * Bounded background sweep, safe to run concurrently with itself and with any in-flight execution, since every
 * transition it triggers delegates to a store or service method that already owns the corresponding invariant
 * (generation fencing, capture-wins-over-cancellation, replay-safe settlement) — this class only decides which
 * one to call. It recovers a `funding_pending` row abandoned before reaching `queued` or `canceled`, drives
 * forward every `queued`/due `awaiting_retry` row (this PR wires no other dispatcher for those), reclaims a
 * `running` lease abandoned past its shutdown grace, cancels any non-`settling` row past its execution deadline
 * (never overriding a capture already decided), and confirms settlement for an intention persisted but never
 * confirmed. A deadline cancellation that actually transitions the row (not a no-op replay) also releases any
 * held reservation and settles every linked request as a zero-charge failure — otherwise a deadline-canceled
 * execution would hold its reservation and leave its requests `pending` forever.
 */
export class VerificationReconciler {
    constructor(
        private readonly executions: VerificationExecutionStore,
        private readonly requests: VerificationRequestStore,
        private readonly settlements: VerificationSettlementStore,
        private readonly settlementService: VerificationSettlementService,
        private readonly runner: VerificationExecutionRunner,
        private readonly credits: CreditReservationService,
        private readonly clock: VerificationClock,
        private readonly leaseTakeoverGraceMs: number,
    ) {}

    async reconcile(limit: number): Promise<VerificationReconcileReport> {
        const executions = await this.executions.pageNonterminal(limit)
        for (const execution of executions) {
            await this.reconcileExecution(execution)
        }

        const intentions = await this.settlements.pagePendingIntentions(limit)
        for (const intention of intentions) {
            await this.settlementService.settle(intention.executionId, intention.organizationId)
        }

        return { executionsChecked: executions.length, intentionsSettled: intentions.length }
    }

    private async reconcileExecution(execution: VerificationExecutionRecord): Promise<void> {
        if (execution.state === 'settling') return

        const now = this.clock.now()
        if (execution.deadlineAt.getTime() <= now.getTime()) {
            const canceled = await this.executions.cancelIfNoCaptureIntention(execution.executionId, execution.organizationId)
            if (canceled.state === 'canceled') {
                const reservation = await this.credits.getReservation(execution.organizationId, execution.executionId)
                if (reservation) {
                    await this.credits.release(execution.organizationId, execution.executionId)
                }
                await this.requests.settleCanceled(execution.executionId, execution.organizationId)
            }
            return
        }

        switch (execution.state) {
            case 'funding_pending':
                await this.reconcileFundingPending(execution)
                return
            case 'queued':
                await this.runner.execute(execution.executionId, execution.organizationId)
                return
            case 'awaiting_retry':
                if (execution.retryAt !== null && execution.retryAt.getTime() <= now.getTime()) {
                    await this.runner.execute(execution.executionId, execution.organizationId)
                }
                return
            case 'running':
                if (
                    execution.leaseExpiresAt !== null &&
                    execution.leaseExpiresAt.getTime() + this.leaseTakeoverGraceMs <= now.getTime()
                ) {
                    await this.executions.takeoverForRetry(
                        execution.executionId,
                        execution.organizationId,
                        execution.attemptGeneration,
                        null,
                    )
                }
                return
        }
    }

    private async reconcileFundingPending(execution: VerificationExecutionRecord): Promise<void> {
        const reservation = await this.credits.getReservation(execution.organizationId, execution.executionId)
        if (reservation) {
            await this.executions.markQueued(execution.executionId, execution.organizationId)
        } else {
            await this.executions.cancelFundingFailure(execution.executionId, execution.organizationId)
        }
    }
}
