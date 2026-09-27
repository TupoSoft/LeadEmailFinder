import { randomUUID } from 'node:crypto'
import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationCooldownReader } from '../../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../../ports/verification-result-cache-reader'
import { VerificationExecutionStore } from '../../ports/verification-execution-store'
import { NewVerificationRequestInput, VerificationRequestRecord, VerificationRequestStore } from '../../ports/verification-request-store'
import { isCachedResultUsable } from '../../verification-result-cache'
import {
    BatchAdmissionFence,
    BatchAdmissionPhase,
    BatchAdmissionRecord,
    BatchAdmissionStore,
    BatchUniqueAddressRecord,
} from './batch-admission-store'

/** Address transitions (resolution, queuing, cancellation, receipt materialization) one advancement may make. */
export const BATCH_ADMISSION_ADDRESS_STEP_BUDGET = 100
const CONTINUATION_DELAY_MS = 1_000

export type BatchAdmissionContinuationPhase = BatchAdmissionPhase | 'funding' | 'closure'

/**
 * `complete`: admission and receipt finalization are done, so the batch may dispatch. `busy`: another live owner
 * holds the group (or this owner lost it). `continuation`: this call spent its budget; the phase and last handled
 * row are only hints, since the next advancement restarts from the first incomplete persisted row.
 */
export type BatchAdmissionAdvance =
    | { readonly kind: 'complete' }
    | { readonly kind: 'busy'; readonly retryAt: Date }
    | {
          readonly kind: 'continuation'
          readonly retryAt: Date
          readonly phase: BatchAdmissionContinuationPhase
          readonly afterFirstSeenRow: number
      }

/** Raised inside one advancement when a guarded write reports that this owner no longer holds the group. */
class AdmissionOwnershipLost extends Error {
    name = 'AdmissionOwnershipLost'
}

class AdmissionAdvancement {
    lost = false
    private stepsRemaining: number
    private creditOperationUsed = false

    constructor(
        readonly batchId: string,
        readonly organizationId: string,
        private readonly ownerId: string,
        private readonly generation: number,
        private readonly clock: VerificationClock,
        stepBudget: number,
    ) {
        this.stepsRemaining = stepBudget
    }

    fence(): BatchAdmissionFence {
        return { ownerId: this.ownerId, generation: this.generation, now: this.clock.now() }
    }

    /** Stops before the next write or credit call once renewal reported the lease lost. */
    assertOwned(): void {
        if (this.lost) throw new AdmissionOwnershipLost()
    }

    get remainingSteps(): number {
        return this.stepsRemaining
    }

    spendStep(): void {
        this.stepsRemaining -= 1
    }

    /** The whole-manifest reserve or close call is indivisible; one advancement makes at most one. */
    takeCreditOperation(): boolean {
        if (this.creditOperationUsed) return false
        this.creditOperationUsed = true
        return true
    }
}

function ensureApplied(write: 'applied' | 'stale' | 'incomplete'): void {
    if (write === 'stale') throw new AdmissionOwnershipLost()
}

/**
 * Coordinates one batch group's admission through a durable, generation-fenced lease: resolve every unique address,
 * freeze the owned-operation list, reserve it once through `CreditReservationService.reserveMany()`, then queue the
 * owned executions (or cancel and close them on denial) and materialize every receipt. Each `admit()` call is one
 * bounded advancement of at most `stepBudget` address transitions plus at most one whole-manifest credit call, so
 * the batch workflow and background recovery can share it and resume from persisted state after interruption.
 */
export class BatchAdmissionService {
    constructor(
        private readonly admissions: BatchAdmissionStore,
        private readonly executions: VerificationExecutionStore,
        private readonly requests: VerificationRequestStore,
        private readonly cacheReader: VerificationResultCacheReader,
        private readonly cooldownReader: VerificationCooldownReader,
        private readonly credits: CreditReservationService,
        private readonly clock: VerificationClock,
        private readonly cacheTtlMs: number,
        private readonly executionDeadlineMs: number,
        private readonly addressCooldownMs: number,
        private readonly leaseDurationMs: number,
        private readonly leaseRenewalMs: number,
        private readonly stepBudget: number = BATCH_ADMISSION_ADDRESS_STEP_BUDGET,
    ) {}

    async admit(batchId: string, organizationId: string): Promise<BatchAdmissionAdvance> {
        const admission = await this.admissions.findById(batchId, organizationId)
        if (!admission) throw new Error(`Batch admission ${batchId} not found for organization ${organizationId}`)
        if (this.isFinished(admission)) return { kind: 'complete' }

        const ownerId = randomUUID()
        const claimedAt = this.clock.now()
        const lease = await this.admissions.claimAdmissionLease(
            batchId,
            organizationId,
            ownerId,
            claimedAt,
            this.leaseExpiry(claimedAt),
        )
        if (lease.kind === 'busy') return { kind: 'busy', retryAt: lease.leaseExpiresAt }

        const advancement = new AdmissionAdvancement(
            batchId,
            organizationId,
            ownerId,
            lease.generation,
            this.clock,
            this.stepBudget,
        )
        const renewal = this.startRenewal(advancement)
        try {
            return await this.advance(advancement, lease.record)
        } catch (error) {
            if (error instanceof AdmissionOwnershipLost) return { kind: 'busy', retryAt: this.continueAt() }
            throw error
        } finally {
            clearInterval(renewal)
            // A failed release only delays the next owner until the lease expires; it must not mask the result.
            await this.admissions.releaseAdmissionLease(batchId, organizationId, advancement.fence()).catch(() => undefined)
        }
    }

    private isFinished(admission: BatchAdmissionRecord): boolean {
        return (
            admission.state === 'invalid' ||
            admission.fundingDecision === 'closed' ||
            ((admission.state === 'admitted' || admission.state === 'insufficient_credits') &&
                admission.finalizationState === 'ready')
        )
    }

    /** Renews serially at the liveness cadence; an overlapping tick is skipped rather than queued. */
    private startRenewal(advancement: AdmissionAdvancement): ReturnType<typeof setInterval> {
        let renewing = false
        return setInterval(() => {
            if (renewing || advancement.lost) return
            renewing = true
            const fence = advancement.fence()
            this.admissions
                .renewAdmissionLease(advancement.batchId, advancement.organizationId, fence, this.leaseExpiry(fence.now))
                .then(renewed => {
                    if (!renewed) advancement.lost = true
                })
                .catch(() => {
                    advancement.lost = true
                })
                .finally(() => {
                    renewing = false
                })
        }, this.leaseRenewalMs)
    }

    private async advance(advancement: AdmissionAdvancement, admission: BatchAdmissionRecord): Promise<BatchAdmissionAdvance> {
        const { batchId, organizationId } = advancement
        let state = admission.state
        let decision = admission.fundingDecision

        if (state === 'validating') {
            advancement.assertOwned()
            ensureApplied(await this.admissions.transitionState(batchId, organizationId, advancement.fence(), 'validating', 'admitting'))
            state = 'admitting'
        }

        if (state === 'admitting') {
            const continuation = await this.forEachIncomplete(advancement, 'resolution', address =>
                this.resolveAddress(advancement, address.normalizedAddress),
            )
            if (continuation) return continuation

            advancement.assertOwned()
            const frozen = await this.admissions.freezeFundingManifest(batchId, organizationId, advancement.fence())
            ensureApplied(frozen)
            if (frozen === 'incomplete') throw new Error('batch_admission_manifest_incomplete')
            state = 'funding'
        }

        if (state === 'funding') {
            if (decision === 'pending') {
                const decided = await this.decideFunding(advancement)
                if (typeof decided !== 'string') return decided
                decision = decided
            }

            if (decision === 'approved') {
                const continuation = await this.forEachIncomplete(advancement, 'queue', async address => {
                    ensureApplied(
                        await this.executions.markBatchGroupQueued(
                            address.executionId!,
                            organizationId,
                            batchId,
                            advancement.fence(),
                        ),
                    )
                })
                if (continuation) return continuation
                advancement.assertOwned()
                ensureApplied(await this.admissions.transitionState(batchId, organizationId, advancement.fence(), 'funding', 'admitted'))
                state = 'admitted'
            } else if (decision === 'denied') {
                const continuation = await this.closeDeniedGroup(advancement)
                if (continuation) return continuation
                state = 'insufficient_credits'
            } else {
                return { kind: 'complete' }
            }
        }

        if (state === 'admitted' || state === 'insufficient_credits') {
            const admitted = state === 'admitted'
            const continuation = await this.forEachIncomplete(advancement, 'materialization', address =>
                this.materializeRequest(batchId, organizationId, address, admitted),
            )
            if (continuation) return continuation

            advancement.assertOwned()
            const ready = await this.admissions.markFinalizationReady(batchId, organizationId, advancement.fence())
            ensureApplied(ready)
            if (ready === 'incomplete') throw new Error('batch_admission_receipts_incomplete')
        }

        return { kind: 'complete' }
    }

    /**
     * Reserves the whole frozen manifest once. Approval requires every returned reservation to be `reserved`: a
     * `released` row means another generation already closed this admission (a replay returns its tombstone), so the
     * group takes the denied path instead. A `captured` row is impossible before approval and fails loudly.
     */
    private async decideFunding(advancement: AdmissionAdvancement): Promise<'approved' | 'denied' | BatchAdmissionAdvance> {
        const { batchId, organizationId } = advancement
        if (!advancement.takeCreditOperation()) return this.continuation('funding', -1)

        const owned = await this.admissions.listOwnedExecutionIds(batchId, organizationId)
        let decision: 'approved' | 'denied' = 'approved'
        if (owned.length > 0) {
            advancement.assertOwned()
            try {
                const reservations = await this.credits.reserveMany(
                    organizationId,
                    owned.map(operationId => ({ operationId, amount: 1 })),
                )
                if (reservations.some(reservation => reservation.state === 'captured')) {
                    throw new Error('batch_admission_captured_before_approval')
                }
                if (reservations.some(reservation => reservation.state !== 'reserved')) decision = 'denied'
            } catch (error) {
                // Only insufficient funds is a decision; every other credit failure stays retryable from `pending`.
                if (!(error instanceof InsufficientCreditsException)) throw error
                decision = 'denied'
            }
        }

        // A stale owner's late reservation response cannot record a decision or queue anything.
        ensureApplied(await this.admissions.recordFundingDecision(batchId, organizationId, advancement.fence(), decision))
        return decision
    }

    /** Fences every still-pending owned execution before closing the whole frozen list; a denied group is never
     *  reserved again, even after a top-up. */
    private async closeDeniedGroup(advancement: AdmissionAdvancement): Promise<BatchAdmissionAdvance | null> {
        const { batchId, organizationId } = advancement
        const continuation = await this.forEachIncomplete(advancement, 'cancellation', async address => {
            ensureApplied(
                await this.executions.cancelBatchGroupFundingPending(
                    address.executionId!,
                    organizationId,
                    batchId,
                    advancement.fence(),
                ),
            )
        })
        if (continuation) return continuation

        if (!advancement.takeCreditOperation()) return this.continuation('closure', -1)
        const owned = await this.admissions.listOwnedExecutionIds(batchId, organizationId)
        if (owned.length > 0) {
            advancement.assertOwned()
            await this.credits.closeAdmissionMany(
                organizationId,
                owned.map(operationId => ({ operationId, amount: 1 })),
            )
        }
        advancement.assertOwned()
        ensureApplied(
            await this.admissions.transitionState(batchId, organizationId, advancement.fence(), 'funding', 'insufficient_credits'),
        )
        return null
    }

    /**
     * Handles the phase's incomplete addresses in `firstSeenRow` order while budget remains, charging one step per
     * address. Returns a continuation when the budget runs out with work left; otherwise confirms from persisted
     * state that no incomplete address remains anywhere in the manifest.
     */
    private async forEachIncomplete(
        advancement: AdmissionAdvancement,
        phase: BatchAdmissionPhase,
        handle: (address: BatchUniqueAddressRecord) => Promise<void>,
    ): Promise<BatchAdmissionAdvance | null> {
        const { batchId, organizationId } = advancement
        let afterFirstSeenRow = -1
        for (;;) {
            const remaining = advancement.remainingSteps
            const page = await this.admissions.pageIncompleteAddresses(
                batchId,
                organizationId,
                phase,
                afterFirstSeenRow,
                Math.max(remaining, 1),
            )
            if (page.length === 0) break
            if (remaining <= 0) return this.continuation(phase, afterFirstSeenRow)

            for (const address of page) {
                advancement.assertOwned()
                await handle(address)
                advancement.spendStep()
                afterFirstSeenRow = address.firstSeenRow
            }
        }

        const leftover = await this.admissions.pageIncompleteAddresses(batchId, organizationId, phase, -1, 1)
        if (leftover.length > 0) throw new Error(`batch_admission_${phase}_incomplete`)
        return null
    }

    private continuation(phase: BatchAdmissionContinuationPhase, afterFirstSeenRow: number): BatchAdmissionAdvance {
        return { kind: 'continuation', retryAt: this.continueAt(), phase, afterFirstSeenRow }
    }

    private continueAt(): Date {
        return new Date(this.clock.now().getTime() + CONTINUATION_DELAY_MS)
    }

    private leaseExpiry(now: Date): Date {
        return new Date(now.getTime() + this.leaseDurationMs)
    }

    private async resolveAddress(advancement: AdmissionAdvancement, normalizedAddress: string): Promise<void> {
        const { batchId, organizationId } = advancement
        const payerRequestId = await this.admissions.ensurePayerRequestId(
            batchId,
            organizationId,
            normalizedAddress,
            randomUUID(),
        )
        const now = this.clock.now()
        const isUsable = (candidate: Parameters<typeof isCachedResultUsable>[0]): boolean =>
            isCachedResultUsable(candidate, now, this.cacheTtlMs)
        const record = async (outcome: Parameters<BatchAdmissionStore['recordAdmissionOutcome']>[4]): Promise<void> => {
            advancement.assertOwned()
            ensureApplied(
                await this.admissions.recordAdmissionOutcome(
                    batchId,
                    organizationId,
                    advancement.fence(),
                    normalizedAddress,
                    outcome,
                ),
            )
        }

        const candidate = await this.cacheReader.findLatestCandidate(organizationId, normalizedAddress)
        if (candidate && isUsable(candidate)) {
            await record({ admissionKind: 'cache', executionId: null, resultId: candidate.resultId })
            return
        }

        const cooldown = await this.cooldownReader.findLatestOutcome(organizationId, normalizedAddress)
        if (cooldown && cooldown.verificationQuality === 'inconclusive') {
            const cooldownActiveUntilMs = cooldown.createdAt.getTime() + this.addressCooldownMs
            if (now.getTime() < cooldownActiveUntilMs) {
                await record({ admissionKind: 'cooldown', executionId: null, resultId: cooldown.resultId })
                return
            }
        }

        const executionId = randomUUID()
        const deadlineAt = new Date(now.getTime() + this.executionDeadlineMs)
        advancement.assertOwned()
        const claim = await this.executions.claimOrJoinForBatchGroup(
            batchId,
            advancement.fence(),
            organizationId,
            normalizedAddress,
            payerRequestId,
            executionId,
            deadlineAt,
            isUsable,
        )

        switch (claim.kind) {
            case 'stale-admission':
                throw new AdmissionOwnershipLost()
            case 'cache-available':
                await record({ admissionKind: 'cache', executionId: null, resultId: claim.resultId })
                return
            case 'joined':
                // A joined execution this same batch already owns is a resumed claim, not another funder's work:
                // the earlier attempt committed the claim but crashed before recording this outcome. The category
                // identifies the funding owner, not whether this attempt inserted the row, so it must still be
                // funded as `created` -- recording it as `shared` would leave it permanently unfunded.
                if (claim.execution.fundingOwnerType === 'batch_group' && claim.execution.fundingOwnerId === batchId) {
                    if (
                        claim.execution.organizationId !== organizationId ||
                        claim.execution.normalizedAddress !== normalizedAddress ||
                        claim.execution.payerRequestId !== payerRequestId
                    ) {
                        throw new Error('batch_admission_ownership_conflict')
                    }
                    await record({ admissionKind: 'created', executionId: claim.execution.executionId, resultId: null })
                    return
                }
                await record({ admissionKind: 'shared', executionId: claim.execution.executionId, resultId: null })
                return
            case 'created':
                await record({ admissionKind: 'created', executionId, resultId: null })
                return
        }
    }

    private async materializeRequest(
        batchId: string,
        organizationId: string,
        address: BatchUniqueAddressRecord,
        groupAdmitted: boolean,
    ): Promise<void> {
        const requestId = address.payerRequestId ?? await this.admissions.ensurePayerRequestId(
            batchId,
            organizationId,
            address.normalizedAddress,
            randomUUID(),
        )
        const input = this.requestInput(requestId, organizationId, address, groupAdmitted)
        if (!input) return

        // Identity is reserved before resolution, so even a linked manifest can still need its receipt inserted.
        const existing = await this.requests.findById(requestId, organizationId)
        if (existing) {
            this.assertReceiptIdentity(existing, input)
            return
        }

        const outcome = await this.requests.insert(input)
        if (outcome.kind === 'key-conflict') {
            throw new Error('Unexpected idempotency-key conflict inserting a keyless batch request')
        }
        this.assertReceiptIdentity(outcome.record, input)
    }

    private requestInput(
        requestId: string,
        organizationId: string,
        address: BatchUniqueAddressRecord,
        groupAdmitted: boolean,
    ): NewVerificationRequestInput | null {
        const identity = {
            requestId,
            organizationId,
            normalizedAddress: address.normalizedAddress,
            deliveryMode: 'batch' as const,
            clientRequestKey: null,
        }
        switch (address.admissionKind) {
            case 'cache':
            case 'cooldown':
                return {
                    ...identity,
                    source: address.admissionKind,
                    executionId: null,
                    resultId: address.resultId,
                    reservedCount: 0,
                    billingState: 'settled',
                    finalReason: address.admissionKind === 'cache' ? 'cached' : 'inconclusive',
                }
            case 'shared':
                return {
                    ...identity,
                    source: 'shared',
                    executionId: address.executionId,
                    resultId: null,
                    reservedCount: 0,
                    billingState: 'pending',
                    finalReason: null,
                }
            case 'created':
                return {
                    ...identity,
                    source: 'fresh',
                    executionId: groupAdmitted ? address.executionId : null,
                    resultId: null,
                    reservedCount: groupAdmitted ? 1 : 0,
                    billingState: groupAdmitted ? 'pending' : 'settled',
                    finalReason: groupAdmitted ? null : 'failed',
                }
            case null:
                return null
        }
    }

    private assertReceiptIdentity(record: VerificationRequestRecord, input: NewVerificationRequestInput): void {
        if (
            record.requestId !== input.requestId ||
            record.organizationId !== input.organizationId ||
            record.normalizedAddress !== input.normalizedAddress ||
            record.deliveryMode !== input.deliveryMode ||
            record.clientRequestKey !== input.clientRequestKey ||
            record.source !== input.source ||
            record.executionId !== input.executionId ||
            ((input.source === 'cache' || input.source === 'cooldown') && record.resultId !== input.resultId)
        ) {
            throw new Error('batch_request_identity_conflict')
        }
    }
}
