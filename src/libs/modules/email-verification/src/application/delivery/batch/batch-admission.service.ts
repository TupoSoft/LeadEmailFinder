import { randomUUID } from 'node:crypto'
import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationCooldownReader } from '../../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../../ports/verification-result-cache-reader'
import { VerificationExecutionStore } from '../../ports/verification-execution-store'
import { NewVerificationRequestInput, VerificationRequestRecord, VerificationRequestStore } from '../../ports/verification-request-store'
import { isCachedResultUsable } from '../../verification-result-cache'
import { BatchAdmissionStore, BatchUniqueAddressRecord } from './batch-admission-store'

const DEFAULT_PAGE_SIZE = 100

/**
 * Admits every unique address in a validated batch upload atomically: at most one credit is reserved per new
 * execution, reserved once for the whole batch through `CreditReservationService.reserveMany()` rather than one
 * address at a time. Resolution (cache/cooldown/shared/created) and the eventual per-address
 * `VerificationRequestStore` row are both idempotent — a worker retry re-running `admit()` resumes exactly where
 * an interrupted prior attempt left off, since every write here is a no-op once already recorded.
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
        private readonly pageSize: number = DEFAULT_PAGE_SIZE,
    ) {}

    async admit(batchId: string, organizationId: string): Promise<void> {
        const admission = await this.admissions.findById(batchId, organizationId)
        if (!admission) throw new Error(`Batch admission ${batchId} not found for organization ${organizationId}`)

        // Resolution and funding only need to run once — once the group has left `validating`/`admitting`, a
        // retry skips straight to materializing any request rows a prior, interrupted attempt never got to.
        if (admission.state === 'validating' || admission.state === 'admitting') {
            if (admission.state === 'validating') {
                await this.admissions.updateState(batchId, organizationId, 'admitting')
            }

            await this.forEachUnresolvedAddress(batchId, organizationId, address =>
                this.resolveAddress(batchId, organizationId, address.normalizedAddress),
            )

            const created = await this.collectCreatedExecutions(batchId, organizationId)
            if (created.length === 0) {
                await this.admissions.updateState(batchId, organizationId, 'admitted')
            } else {
                await this.fundCreatedExecutions(batchId, organizationId, created)
            }
        }

        const finalAdmission = await this.admissions.findById(batchId, organizationId)
        const admitted = finalAdmission?.state === 'admitted'
        await this.forEachResolvedAddress(batchId, organizationId, address =>
            this.materializeRequest(batchId, organizationId, address, admitted),
        )
    }

    private async forEachUnresolvedAddress(
        batchId: string,
        organizationId: string,
        handle: (address: BatchUniqueAddressRecord) => Promise<void>,
    ): Promise<void> {
        for (let skip = 0; ; skip += this.pageSize) {
            const page = await this.admissions.pageUniqueAddresses(batchId, organizationId, skip, this.pageSize)
            if (page.length === 0) return
            for (const address of page) {
                if (address.admissionKind === null) await handle(address)
            }
        }
    }

    private async forEachResolvedAddress(
        batchId: string,
        organizationId: string,
        handle: (address: BatchUniqueAddressRecord) => Promise<void>,
    ): Promise<void> {
        for (let skip = 0; ; skip += this.pageSize) {
            const page = await this.admissions.pageUniqueAddresses(batchId, organizationId, skip, this.pageSize)
            if (page.length === 0) return
            for (const address of page) {
                if (address.admissionKind !== null) await handle(address)
            }
        }
    }

    private async collectCreatedExecutions(
        batchId: string,
        organizationId: string,
    ): Promise<readonly { readonly normalizedAddress: string; readonly executionId: string }[]> {
        const created: { readonly normalizedAddress: string; readonly executionId: string }[] = []
        for (let skip = 0; ; skip += this.pageSize) {
            const page = await this.admissions.pageUniqueAddresses(batchId, organizationId, skip, this.pageSize)
            if (page.length === 0) return created
            for (const address of page) {
                if (address.admissionKind === 'created' && address.executionId !== null) {
                    created.push({ normalizedAddress: address.normalizedAddress, executionId: address.executionId })
                }
            }
        }
    }

    private async resolveAddress(batchId: string, organizationId: string, normalizedAddress: string): Promise<void> {
        const payerRequestId = await this.admissions.ensurePayerRequestId(
            batchId,
            organizationId,
            normalizedAddress,
            randomUUID(),
        )
        const now = this.clock.now()
        const isUsable = (candidate: Parameters<typeof isCachedResultUsable>[0]): boolean =>
            isCachedResultUsable(candidate, now, this.cacheTtlMs)

        const candidate = await this.cacheReader.findLatestCandidate(organizationId, normalizedAddress)
        if (candidate && isUsable(candidate)) {
            await this.admissions.recordAdmissionOutcome(batchId, normalizedAddress, {
                admissionKind: 'cache',
                executionId: null,
                resultId: candidate.resultId,
            })
            return
        }

        const cooldown = await this.cooldownReader.findLatestOutcome(organizationId, normalizedAddress)
        if (cooldown && cooldown.verificationQuality === 'inconclusive') {
            const cooldownActiveUntilMs = cooldown.createdAt.getTime() + this.addressCooldownMs
            if (now.getTime() < cooldownActiveUntilMs) {
                await this.admissions.recordAdmissionOutcome(batchId, normalizedAddress, {
                    admissionKind: 'cooldown',
                    executionId: null,
                    resultId: cooldown.resultId,
                })
                return
            }
        }

        const executionId = randomUUID()
        const deadlineAt = new Date(now.getTime() + this.executionDeadlineMs)
        const claim = await this.executions.claimOrJoin(
            organizationId,
            normalizedAddress,
            payerRequestId,
            executionId,
            deadlineAt,
            isUsable,
            { type: 'batch_group', id: batchId },
        )

        if (claim.kind === 'cache-available') {
            await this.admissions.recordAdmissionOutcome(batchId, normalizedAddress, {
                admissionKind: 'cache',
                executionId: null,
                resultId: claim.resultId,
            })
            return
        }
        if (claim.kind === 'joined') {
            await this.admissions.recordAdmissionOutcome(batchId, normalizedAddress, {
                admissionKind: 'shared',
                executionId: claim.execution.executionId,
                resultId: null,
            })
            return
        }
        await this.admissions.recordAdmissionOutcome(batchId, normalizedAddress, {
            admissionKind: 'created',
            executionId,
            resultId: null,
        })
    }

    private async fundCreatedExecutions(
        batchId: string,
        organizationId: string,
        created: readonly { readonly normalizedAddress: string; readonly executionId: string }[],
    ): Promise<void> {
        try {
            await this.credits.reserveMany(
                organizationId,
                created.map(item => ({ operationId: item.executionId, amount: 1 })),
            )
        } catch (error) {
            if (!(error instanceof InsufficientCreditsException)) throw error

            for (const item of created) {
                await this.executions.cancelFundingFailure(item.executionId, organizationId)
            }
            await this.credits.closeAdmissionMany(
                organizationId,
                created.map(item => ({ operationId: item.executionId, amount: 1 })),
            )
            await this.admissions.updateState(batchId, organizationId, 'insufficient_credits')
            return
        }

        for (const item of created) {
            await this.executions.markQueued(item.executionId, organizationId)
        }
        await this.admissions.updateState(batchId, organizationId, 'admitted')
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
