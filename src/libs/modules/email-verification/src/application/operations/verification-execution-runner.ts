import { randomUUID } from 'node:crypto'
import { EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { MailboxVerificationService } from '../mailbox-verification.service'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationExecutionPermits } from '../ports/verification-execution-permits'
import { VerificationExecutionStore } from '../ports/verification-execution-store'
import { VerificationFinalReason } from '../ports/verification-request-store'
import { VerificationSettlementDecision, VerificationSettlementStore } from '../ports/verification-settlement-store'
import { VerificationSettlementService } from './verification-settlement.service'

export type ExecutionOutcome =
    | { readonly kind: 'settled' }
    | { readonly kind: 'retry-scheduled'; readonly retryAt: Date }
    | { readonly kind: 'lease-lost' }
    | { readonly kind: 'not-runnable' }
    | { readonly kind: 'permit-unavailable' }

const GREYLIST_BACKOFF_UNIT_MS = 60_000
const TRANSIENT_FAILURE_BACKOFF_MS = 10_000

/**
 * Runs one attempt of a queued/awaiting_retry execution end to end: acquires a global execution permit (bounding
 * concurrent outbound SMTP probes across sync/async/batch callers), then a generation-fenced lease, probes the
 * mailbox with the lease wired to an abort signal so a lost lease cancels the in-flight SMTP connection, then
 * persists the result and settles the credit intention. The renewal timer polls at `leaseLivenessPollMs` for the
 * entire probe call, since a probe may hold an open SMTP connection at any point within it and the application
 * layer has no port to observe the underlying socket's lifecycle more precisely; it also best-effort renews the
 * permit on the same cadence — a failed permit renewal alone does not abort the probe, unlike lease-renewal
 * failure. Every branch is guarded by the same expected generation captured at lease acquisition, so even a
 * `leaseLost` flag that is momentarily stale can never let an abandoned attempt persist a result or settle
 * credits after a competitor has taken over — `persistResultAndIntention`'s own generation check is the
 * authoritative fence. The permit is released on every return path once acquired.
 */
export class VerificationExecutionRunner {
    constructor(
        private readonly executions: VerificationExecutionStore,
        private readonly settlements: VerificationSettlementStore,
        private readonly settlementService: VerificationSettlementService,
        private readonly mailboxVerification: MailboxVerificationService,
        private readonly clock: VerificationClock,
        private readonly permits: VerificationExecutionPermits,
        private readonly leaseDurationMs: number,
        private readonly leaseLivenessPollMs: number,
        private readonly maxConcurrentExecutions: number,
    ) {}

    async execute(executionId: string, organizationId: string): Promise<ExecutionOutcome> {
        const leaseOwnerId = randomUUID()
        const permitAcquired = await this.permits.tryAcquire(
            leaseOwnerId,
            organizationId,
            this.clock.now(),
            this.leaseExpiry(),
            this.maxConcurrentExecutions,
        )
        if (!permitAcquired) return { kind: 'permit-unavailable' }

        const leased = await this.executions.acquireLease(
            executionId,
            organizationId,
            leaseOwnerId,
            this.leaseExpiry(),
            this.clock.now(),
        )
        if (!leased) {
            await this.permits.release(leaseOwnerId)
            return { kind: 'not-runnable' }
        }

        const generation = leased.attemptGeneration
        const controller = new AbortController()
        let leaseLost = false

        const renewalTimer = setInterval(() => {
            const nextExpiry = this.leaseExpiry()
            this.executions
                .renewLease(executionId, organizationId, leaseOwnerId, generation, nextExpiry)
                .then((renewed) => {
                    if (!renewed) {
                        leaseLost = true
                        controller.abort()
                    }
                })
                .catch(() => {
                    leaseLost = true
                    controller.abort()
                })
            // Best-effort: a failed permit renewal does not by itself abort the in-flight probe, unlike lease
            // renewal failure — see the plan's Decision Log for the accepted trade-off. The rejection must still
            // be handled explicitly: an unhandled rejection here would otherwise crash the process under Node's
            // default behavior.
            this.permits.renew(leaseOwnerId, nextExpiry).catch(() => {})
        }, this.leaseLivenessPollMs)

        try {
            const probeResult = await this.mailboxVerification.verify(
                organizationId,
                leased.normalizedAddress,
                undefined,
                controller.signal,
            )

            if (leaseLost) return { kind: 'lease-lost' }

            if (probeResult.reason === EmailVerificationReason.TemporarilyBlocked) {
                return await this.scheduleRetry(executionId, organizationId, generation, this.greylistBackoffMs(generation))
            }

            const decision: VerificationSettlementDecision =
                probeResult.verificationQuality === 'inconclusive' ? 'release' : 'capture'
            const finalReason: VerificationFinalReason =
                probeResult.verificationQuality === 'inconclusive' ? 'inconclusive' : 'conclusive'

            const persisted = await this.settlements.persistResultAndIntention({
                executionId,
                organizationId,
                expectedGeneration: generation,
                newVerification: probeResult,
                decision,
                finalReason,
            })

            if (persisted.kind === 'stale-generation' || persisted.kind === 'terminal') {
                return { kind: 'lease-lost' }
            }

            await this.settlementService.settle(executionId, organizationId)
            return { kind: 'settled' }
        } catch {
            if (leaseLost) return { kind: 'lease-lost' }
            return await this.scheduleRetry(executionId, organizationId, generation, TRANSIENT_FAILURE_BACKOFF_MS)
        } finally {
            clearInterval(renewalTimer)
            await this.permits.release(leaseOwnerId)
        }
    }

    private leaseExpiry(): Date {
        return new Date(this.clock.now().getTime() + this.leaseDurationMs)
    }

    private greylistBackoffMs(generation: number): number {
        return (generation + 1) * GREYLIST_BACKOFF_UNIT_MS
    }

    private async scheduleRetry(
        executionId: string,
        organizationId: string,
        generation: number,
        delayMs: number,
    ): Promise<ExecutionOutcome> {
        const retryAt = new Date(this.clock.now().getTime() + delayMs)
        const result = await this.executions.takeoverForRetry(executionId, organizationId, generation, retryAt)
        if (!result) return { kind: 'lease-lost' }
        return { kind: 'retry-scheduled', retryAt }
    }
}
