import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { BatchAdmissionRecovery } from '../ports/batch-admission-recovery'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionRecord, VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationRequestStore } from '../ports/verification-request-store'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'
import { VerificationExecutionDispatcher } from '../ports/verification-execution-dispatcher'
import { VerificationSettlementService } from './verification-settlement.service'

export interface VerificationReconcileReport {
    readonly executionsChecked: number
    readonly intentionsSettled: number
    readonly cancellationsCleanedUp: number
    readonly batchGroupsChecked: number
}

/** Bounded recovery of durable funding, command publication, deadlines, and replay-safe settlement.
 * Active remote attempts are never replaced just because publication or result delivery is uncertain. */
export class VerificationReconciler {
    constructor(
        private readonly executions: VerificationExecutionStore,
        private readonly requests: VerificationRequestStore,
        private readonly settlements: VerificationSettlementStore,
        private readonly settlementService: VerificationSettlementService,
        private readonly dispatcher: VerificationExecutionDispatcher,
        private readonly credits: CreditReservationService,
        private readonly clock: VerificationClock,
        private readonly batchAdmissionRecovery: BatchAdmissionRecovery,
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

        // `cancelIfNoCaptureIntention` commits `canceled` (terminal) before the credit release and request
        // settlement below run; if either fails, or the process exits between them, that row is invisible to
        // `pageNonterminal` forever afterward. This sweep is the recovery path: both steps are idempotent-safe
        // to repeat, so retrying cleanup for every canceled row still holding a pending request costs nothing
        // once it has genuinely finished.
        const pendingCleanup = await this.executions.pageCanceledPendingCleanup(limit)
        for (const execution of pendingCleanup) {
            await this.cleanUpCancellation(execution)
        }

        const batchGroups = await this.batchAdmissionRecovery.reconcile(limit)

        return {
            executionsChecked: executions.length,
            intentionsSettled: intentions.length,
            cancellationsCleanedUp: pendingCleanup.length,
            batchGroupsChecked: batchGroups.groupsChecked,
        }
    }

    private async cleanUpCancellation(execution: VerificationExecutionRecord): Promise<void> {
        const reservation = await this.credits.getReservation(execution.organizationId, execution.executionId)
        if (reservation) {
            await this.credits.release(execution.organizationId, execution.executionId)
        }

        await this.requests.settleCanceled(execution.executionId, execution.organizationId)
    }

    private async reconcileExecution(execution: VerificationExecutionRecord): Promise<void> {
        if (execution.state === 'settling') {
            return
        }

        // An unfunded batch execution is normal while its group resolves addresses; only group recovery may decide
        // it, never this generic deadline or missing-reservation path.
        if (execution.state === 'funding_pending' && execution.fundingOwnerType === 'batch_group') {
            return
        }

        const now = this.clock.now()

        if (execution.deadlineAt.getTime() <= now.getTime()) {
            const canceled = await this.executions.cancelIfNoCaptureIntention(
                execution.executionId,
                execution.organizationId,
            )

            if (canceled.state === 'canceled') {
                await this.cleanUpCancellation(execution)
            }

            return
        }

        switch (execution.state) {
            case 'funding_pending':
                await this.reconcileFundingPending(execution)
                return
            case 'queued':
                await this.dispatcher.dispatch(execution.executionId, execution.organizationId)
                return
            case 'awaiting_retry':
                if (execution.retryAt !== null && execution.retryAt.getTime() <= now.getTime()) {
                    await this.dispatcher.dispatch(execution.executionId, execution.organizationId)
                }
                return
            case 'running':
                // Queue redelivery owns transport recovery; elapsed time never supersedes an active attempt.
                return
        }
    }

    private async reconcileFundingPending(execution: VerificationExecutionRecord): Promise<void> {
        const reservation = await this.credits.getReservation(execution.organizationId, execution.executionId)
        const payer = await this.requests.findById(execution.payerRequestId, execution.organizationId)

        if (reservation && payer) {
            await this.executions.markQueued(execution.executionId, execution.organizationId)
        } else {
            await this.executions.cancelFundingFailure(execution.executionId, execution.organizationId)

            if (reservation) {
                await this.cleanUpCancellation(execution)
            }
        }
    }
}
