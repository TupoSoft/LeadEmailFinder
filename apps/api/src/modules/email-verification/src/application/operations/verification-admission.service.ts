import { randomUUID } from 'node:crypto'
import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../ports/verification-clock'
import { VerificationCooldownReader } from '../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../ports/verification-result-cache-reader'
import {
    VerificationDeliveryMode,
    VerificationRequestRecord,
    VerificationRequestStore,
} from '../ports/verification-request-store'
import { VerificationExecutionStore } from '../ports/verification-execution-store'
import { checkVerificationIdempotencyKeyAge } from '../verification-idempotency-key'
import { isCachedResultUsable } from '../verification-result-cache'

export interface AdmitInput {
    readonly organizationId: string
    readonly email: string
    readonly deliveryMode: VerificationDeliveryMode
    readonly clientRequestKey?: string
}

export type AdmissionOutcome =
    | { readonly kind: 'cached'; readonly requestId: string; readonly resultId: string }
    | { readonly kind: 'joined'; readonly requestId: string; readonly executionId: string }
    | { readonly kind: 'funded'; readonly requestId: string; readonly executionId: string }
    | { readonly kind: 'insufficient-funds'; readonly requestId: string }
    | { readonly kind: 'conflict'; readonly reason: 'key-mismatch' | 'key-expired' }
    | { readonly kind: 'cooldown'; readonly requestId: string; readonly retryAfterMs: number }
    | { readonly kind: 'address-cooldown'; readonly retryAfterMs: number }

const RESERVATION_AMOUNT = 1

export class VerificationAdmissionService {
    constructor(
        private readonly requests: VerificationRequestStore,
        private readonly executions: VerificationExecutionStore,
        private readonly cacheReader: VerificationResultCacheReader,
        private readonly cooldownReader: VerificationCooldownReader,
        private readonly credits: CreditReservationService,
        private readonly clock: VerificationClock,
        private readonly cacheTtlMs: number,
        private readonly executionDeadlineMs: number,
        private readonly addressCooldownMs: number,
    ) {}

    async admit(input: AdmitInput): Promise<AdmissionOutcome> {
        const normalizedAddress = input.email.toLowerCase()
        const now = this.clock.now()
        const clientRequestKey = input.clientRequestKey ?? null

        if (clientRequestKey !== null) {
            const existing = await this.requests.findByClientKey(input.organizationId, clientRequestKey)
            if (existing) {
                if (existing.normalizedAddress !== normalizedAddress || existing.deliveryMode !== input.deliveryMode) {
                    return { kind: 'conflict', reason: 'key-mismatch' }
                }
                return VerificationAdmissionService.replayExisting(existing)
            }
            if (checkVerificationIdempotencyKeyAge(clientRequestKey, now) !== 'valid') {
                return { kind: 'conflict', reason: 'key-expired' }
            }
        }

        const isUsable = (candidate: Parameters<typeof isCachedResultUsable>[0]): boolean =>
            isCachedResultUsable(candidate, now, this.cacheTtlMs)

        const candidate = await this.cacheReader.findLatestCandidate(input.organizationId, normalizedAddress)
        if (candidate && isUsable(candidate)) {
            return this.admitCached(input, normalizedAddress, clientRequestKey, candidate.resultId)
        }

        const cooldown = await this.cooldownReader.findLatestOutcome(input.organizationId, normalizedAddress)
        if (cooldown && cooldown.verificationQuality === 'inconclusive') {
            const retryAfterMs = cooldown.createdAt.getTime() + this.addressCooldownMs - now.getTime()
            if (retryAfterMs > 0) {
                return { kind: 'address-cooldown', retryAfterMs }
            }
        }

        const requestId = randomUUID()
        const executionId = randomUUID()
        const deadlineAt = new Date(now.getTime() + this.executionDeadlineMs)
        const claim = await this.executions.claimOrJoin(
            input.organizationId,
            normalizedAddress,
            requestId,
            executionId,
            deadlineAt,
            isUsable,
        )

        if (claim.kind === 'cache-available') {
            return this.admitCached(input, normalizedAddress, clientRequestKey, claim.resultId, requestId)
        }
        if (claim.kind === 'joined') {
            return this.admitJoined(input, normalizedAddress, clientRequestKey, requestId, claim.execution, now)
        }
        return this.admitCreated(input, normalizedAddress, clientRequestKey, requestId, executionId)
    }

    private async admitCached(
        input: AdmitInput,
        normalizedAddress: string,
        clientRequestKey: string | null,
        resultId: string,
        requestId: string = randomUUID(),
    ): Promise<AdmissionOutcome> {
        const outcome = await this.requests.insert({
            requestId,
            organizationId: input.organizationId,
            normalizedAddress,
            deliveryMode: input.deliveryMode,
            clientRequestKey,
            source: 'cache',
            executionId: null,
            resultId,
            reservedCount: 0,
            billingState: 'settled',
            finalReason: 'cached',
        })
        if (outcome.kind === 'key-conflict') {
            return { kind: 'conflict', reason: 'key-mismatch' }
        }
        return { kind: 'cached', requestId: outcome.record.requestId, resultId }
    }

    private async admitJoined(
        input: AdmitInput,
        normalizedAddress: string,
        clientRequestKey: string | null,
        requestId: string,
        execution: { readonly executionId: string; readonly state: string; readonly retryAt: Date | null },
        now: Date,
    ): Promise<AdmissionOutcome> {
        const outcome = await this.requests.insert({
            requestId,
            organizationId: input.organizationId,
            normalizedAddress,
            deliveryMode: input.deliveryMode,
            clientRequestKey,
            source: 'shared',
            executionId: execution.executionId,
            resultId: null,
            reservedCount: 0,
            billingState: 'pending',
            finalReason: null,
        })
        if (outcome.kind === 'key-conflict') {
            return { kind: 'conflict', reason: 'key-mismatch' }
        }

        if (execution.state === 'awaiting_retry' && execution.retryAt !== null) {
            const retryAfterMs = Math.max(0, execution.retryAt.getTime() - now.getTime())
            return { kind: 'cooldown', requestId: outcome.record.requestId, retryAfterMs }
        }
        return { kind: 'joined', requestId: outcome.record.requestId, executionId: execution.executionId }
    }

    private async admitCreated(
        input: AdmitInput,
        normalizedAddress: string,
        clientRequestKey: string | null,
        requestId: string,
        executionId: string,
    ): Promise<AdmissionOutcome> {
        try {
            await this.credits.reserve(input.organizationId, { operationId: executionId, amount: RESERVATION_AMOUNT })
        } catch (error) {
            if (!(error instanceof InsufficientCreditsException)) {
                throw error
            }

            await this.executions.cancelFundingFailure(executionId, input.organizationId)
            await this.credits.closeAdmissionMany(input.organizationId, [
                { operationId: executionId, amount: RESERVATION_AMOUNT },
            ])
            const outcome = await this.requests.insert({
                requestId,
                organizationId: input.organizationId,
                normalizedAddress,
                deliveryMode: input.deliveryMode,
                clientRequestKey,
                source: 'fresh',
                executionId: null,
                resultId: null,
                reservedCount: 0,
                billingState: 'settled',
                finalReason: 'failed',
            })
            if (outcome.kind === 'key-conflict') {
                return { kind: 'conflict', reason: 'key-mismatch' }
            }
            return { kind: 'insufficient-funds', requestId: outcome.record.requestId }
        }

        const outcome = await this.requests.insert({
            requestId,
            organizationId: input.organizationId,
            normalizedAddress,
            deliveryMode: input.deliveryMode,
            clientRequestKey,
            source: 'fresh',
            executionId,
            resultId: null,
            reservedCount: 1,
            billingState: 'pending',
            finalReason: null,
        })
        if (outcome.kind === 'key-conflict') {
            await this.executions.cancelFundingFailure(executionId, input.organizationId)
            await this.credits.release(input.organizationId, executionId)
            return { kind: 'conflict', reason: 'key-mismatch' }
        }
        // The payer must exist before a command can leave the outbox: a fast worker can finish immediately.
        await this.executions.markQueued(executionId, input.organizationId)
        return { kind: 'funded', requestId: outcome.record.requestId, executionId }
    }

    private static replayExisting(existing: VerificationRequestRecord): AdmissionOutcome {
        if (existing.resultId !== null) {
            return { kind: 'cached', requestId: existing.requestId, resultId: existing.resultId }
        }
        if (existing.executionId !== null) {
            return existing.source === 'fresh'
                ? { kind: 'funded', requestId: existing.requestId, executionId: existing.executionId }
                : { kind: 'joined', requestId: existing.requestId, executionId: existing.executionId }
        }
        return { kind: 'insufficient-funds', requestId: existing.requestId }
    }
}
