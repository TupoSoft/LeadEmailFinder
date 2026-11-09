import {
    BatchGroupClaimOutcome,
    CachedResultCandidate,
    VerificationExecutionRecord,
    VerificationExecutionState,
} from '../../../ports/verification-execution-store'
import {
    BatchAdmissionCheckedWrite,
    BatchAdmissionFence,
    BatchAdmissionGuardedWrite,
    BatchAdmissionLeaseOutcome,
    BatchAdmissionPhase,
    BatchAdmissionRecord,
    BatchAdmissionState,
    BatchAdmissionStore,
    BatchStatusCounts,
    BatchUniqueAddressAdmissionKind,
    BatchUniqueAddressRecord,
    CreateBatchAdmissionOutcome,
    NewBatchAdmissionInput,
} from '../batch-admission-store'

/** What the in-memory manifest needs to know about executions and receipts owned by other stores. */
export interface BatchAdmissionViews {
    executionState(executionId: string): VerificationExecutionState | undefined
    executionOwnedBy(executionId: string, batchId: string, normalizedAddress: string): boolean
    receiptExists(requestId: string, organizationId: string): boolean
}

const NO_VIEWS: BatchAdmissionViews = {
    executionState: () => undefined,
    executionOwnedBy: () => false,
    receiptExists: () => false,
}

function holdsFence(record: BatchAdmissionRecord, fence: BatchAdmissionFence): boolean {
    return (
        record.admissionLeaseOwnerId === fence.ownerId &&
        record.admissionGeneration === fence.generation &&
        record.admissionLeaseExpiresAt !== null &&
        record.admissionLeaseExpiresAt.getTime() > fence.now.getTime()
    )
}

/**
 * Follows the `BatchAdmissionStore` contract, including lease fencing, persisted-phase filtering, and freeze checks,
 * so application tests exercise the same yield and takeover paths as the PostgreSQL adapter.
 */
export class InMemoryBatchAdmissionStore implements BatchAdmissionStore {
    private readonly groups = new Map<string, BatchAdmissionRecord>()
    private readonly manifests = new Map<string, BatchUniqueAddressRecord[]>()

    constructor(public views: BatchAdmissionViews = NO_VIEWS) {}

    seed(
        record: BatchAdmissionRecord,
        addresses: readonly { normalizedAddress: string; firstSeenRow: number }[],
    ): void {
        this.groups.set(record.batchId, record)
        this.manifests.set(
            record.batchId,
            addresses.map(address => ({
                batchId: record.batchId,
                normalizedAddress: address.normalizedAddress,
                firstSeenRow: address.firstSeenRow,
                admissionKind: null,
                executionId: null,
                resultId: null,
                payerRequestId: null,
            })),
        )
    }

    group(batchId: string): BatchAdmissionRecord {
        const record = this.groups.get(batchId)
        if (!record) throw new Error('unknown batch')
        return record
    }

    addresses(batchId: string): readonly BatchUniqueAddressRecord[] {
        return this.manifests.get(batchId) ?? []
    }

    /** Test hook for direct manifest edits that model an earlier interrupted attempt. */
    patchAddress(batchId: string, normalizedAddress: string, patch: Partial<BatchUniqueAddressRecord>): void {
        const list = this.manifests.get(batchId) ?? []
        const index = list.findIndex(address => address.normalizedAddress === normalizedAddress)
        list[index] = { ...list[index], ...patch }
    }

    patchGroup(batchId: string, patch: Partial<BatchAdmissionRecord>): void {
        this.groups.set(batchId, { ...this.group(batchId), ...patch })
    }

    /** Like `@UpdateDateColumn`, every write moves the group after every earlier-updated group. */
    private touch(batchId: string, patch: Partial<BatchAdmissionRecord>): void {
        const latest = Math.max(...[...this.groups.values()].map(record => record.updatedAt.getTime()))
        this.groups.set(batchId, { ...this.group(batchId), ...patch, updatedAt: new Date(latest + 1) })
    }

    private fenced(batchId: string, organizationId: string, fence: BatchAdmissionFence): BatchAdmissionRecord | null {
        const record = this.groups.get(batchId)
        return record && record.organizationId === organizationId && holdsFence(record, fence) ? record : null
    }

    holdsFence(batchId: string, organizationId: string, fence: BatchAdmissionFence): BatchAdmissionRecord | null {
        return this.fenced(batchId, organizationId, fence)
    }

    createOrReplay(input: NewBatchAdmissionInput): Promise<CreateBatchAdmissionOutcome> {
        const existing = this.groups.get(input.batchId)
        if (existing) return Promise.resolve({ kind: 'replayed', record: existing })
        const record: BatchAdmissionRecord = {
            batchId: input.batchId,
            organizationId: input.organizationId,
            state: 'validating',
            fundingDecision: 'pending',
            finalizationState: 'preparing',
            admissionLeaseOwnerId: null,
            admissionLeaseExpiresAt: null,
            admissionGeneration: 0,
            totalRows: input.totalRows,
            uniqueAddressCount: input.uniqueAddressCount,
            clientRequestKey: input.clientRequestKey,
            contentDigest: input.contentDigest,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        this.groups.set(input.batchId, record)
        if (!this.manifests.has(input.batchId)) this.manifests.set(input.batchId, [])
        return Promise.resolve({ kind: 'created', record })
    }

    findById(batchId: string, organizationId: string): Promise<BatchAdmissionRecord | null> {
        const record = this.groups.get(batchId)
        return Promise.resolve(record?.organizationId === organizationId ? record : null)
    }

    findByClientKey(): Promise<BatchAdmissionRecord | null> {
        return Promise.resolve(null)
    }

    insertUniqueAddresses(
        batchId: string,
        _organizationId: string,
        addresses: readonly { normalizedAddress: string; firstSeenRow: number }[],
    ): Promise<void> {
        const list = this.manifests.get(batchId) ?? []
        for (const address of addresses) {
            if (!list.some(existing => existing.normalizedAddress === address.normalizedAddress)) {
                list.push({
                    batchId,
                    normalizedAddress: address.normalizedAddress,
                    firstSeenRow: address.firstSeenRow,
                    admissionKind: null,
                    executionId: null,
                    resultId: null,
                    payerRequestId: null,
                })
            }
        }
        this.manifests.set(batchId, list)
        return Promise.resolve()
    }

    pageUniqueAddresses(
        batchId: string,
        _organizationId: string,
        skip: number,
        take: number,
    ): Promise<readonly BatchUniqueAddressRecord[]> {
        return Promise.resolve(this.sorted(batchId).slice(skip, skip + take))
    }

    recordAdmissionOutcome(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        normalizedAddress: string,
        outcome: {
            readonly admissionKind: BatchUniqueAddressAdmissionKind
            readonly executionId: string | null
            readonly resultId: string | null
        },
    ): Promise<BatchAdmissionGuardedWrite> {
        if (this.fenced(batchId, organizationId, fence)?.state !== 'admitting') return Promise.resolve('stale')
        const list = this.manifests.get(batchId) ?? []
        const index = list.findIndex(address => address.normalizedAddress === normalizedAddress)
        if (index >= 0 && list[index].admissionKind === null) list[index] = { ...list[index], ...outcome }
        return Promise.resolve('applied')
    }

    ensurePayerRequestId(
        batchId: string,
        organizationId: string,
        normalizedAddress: string,
        candidateId: string,
    ): Promise<string> {
        const list = this.manifests.get(batchId) ?? []
        const index = list.findIndex(address => address.normalizedAddress === normalizedAddress)
        if (this.groups.get(batchId)?.organizationId !== organizationId || index < 0) {
            return Promise.reject(new Error('batch_address_not_found'))
        }
        const payerRequestId = list[index].payerRequestId ?? candidateId
        list[index] = { ...list[index], payerRequestId }
        return Promise.resolve(payerRequestId)
    }

    countUnsettledAddresses(batchId: string): Promise<number> {
        return Promise.resolve(this.addresses(batchId).filter(address => address.payerRequestId === null).length)
    }

    getStatusCounts(): Promise<BatchStatusCounts> {
        return Promise.resolve({
            cachedAddresses: 0,
            sharedAddresses: 0,
            cooldownAddresses: 0,
            completedAddresses: 0,
            conclusiveAddresses: 0,
            inconclusiveAddresses: 0,
            failedAddresses: 0,
            reserved: 0,
            charged: 0,
        })
    }

    claimAdmissionLease(
        batchId: string,
        organizationId: string,
        ownerId: string,
        now: Date,
        leaseExpiresAt: Date,
    ): Promise<BatchAdmissionLeaseOutcome> {
        const record = this.groups.get(batchId)
        if (record?.organizationId !== organizationId) return Promise.reject(new Error('batch_admission_not_found'))
        if (
            record.admissionLeaseOwnerId !== null &&
            record.admissionLeaseOwnerId !== ownerId &&
            record.admissionLeaseExpiresAt !== null &&
            record.admissionLeaseExpiresAt.getTime() > now.getTime()
        ) {
            return Promise.resolve({ kind: 'busy', leaseExpiresAt: record.admissionLeaseExpiresAt })
        }
        this.touch(batchId, {
            admissionLeaseOwnerId: ownerId,
            admissionLeaseExpiresAt: leaseExpiresAt,
            admissionGeneration: record.admissionGeneration + 1,
        })
        const claimed = this.group(batchId)
        return Promise.resolve({ kind: 'acquired', generation: claimed.admissionGeneration, record: claimed })
    }

    renewAdmissionLease(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        leaseExpiresAt: Date,
    ): Promise<boolean> {
        if (!this.fenced(batchId, organizationId, fence)) return Promise.resolve(false)
        this.touch(batchId, { admissionLeaseExpiresAt: leaseExpiresAt })
        return Promise.resolve(true)
    }

    releaseAdmissionLease(batchId: string, organizationId: string, fence: BatchAdmissionFence): Promise<void> {
        const record = this.groups.get(batchId)
        if (
            record?.organizationId === organizationId &&
            record.admissionLeaseOwnerId === fence.ownerId &&
            record.admissionGeneration === fence.generation
        ) {
            this.touch(batchId, { admissionLeaseOwnerId: null, admissionLeaseExpiresAt: null })
        }
        return Promise.resolve()
    }

    transitionState(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        from: BatchAdmissionState,
        to: BatchAdmissionState,
    ): Promise<BatchAdmissionGuardedWrite> {
        if (this.fenced(batchId, organizationId, fence)?.state !== from) return Promise.resolve('stale')
        this.touch(batchId, { state: to })
        return Promise.resolve('applied')
    }

    pageRecoverableGroups(now: Date, limit: number): Promise<readonly BatchAdmissionRecord[]> {
        const eligible = [...this.groups.values()]
            .filter(record => record.fundingDecision !== 'closed')
            .filter(
                record =>
                    record.admissionLeaseOwnerId === null ||
                    record.admissionLeaseExpiresAt === null ||
                    record.admissionLeaseExpiresAt.getTime() <= now.getTime(),
            )
            .filter(
                record =>
                    record.state === 'validating' ||
                    record.state === 'admitting' ||
                    record.state === 'funding' ||
                    ((record.state === 'admitted' || record.state === 'insufficient_credits') &&
                        record.finalizationState === 'preparing'),
            )
            .sort(
                (left, right) =>
                    left.updatedAt.getTime() - right.updatedAt.getTime() || left.batchId.localeCompare(right.batchId),
            )
        return Promise.resolve(eligible.slice(0, limit))
    }

    pageIncompleteAddresses(
        batchId: string,
        _organizationId: string,
        phase: BatchAdmissionPhase,
        afterFirstSeenRow: number,
        limit: number,
    ): Promise<readonly BatchUniqueAddressRecord[]> {
        const page = this.sorted(batchId)
            .filter(address => address.firstSeenRow > afterFirstSeenRow)
            .filter(address => this.isIncomplete(address, phase))
            .slice(0, limit)
        return Promise.resolve(page)
    }

    freezeFundingManifest(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite> {
        const record = this.fenced(batchId, organizationId, fence)
        if (record?.state !== 'admitting') return Promise.resolve('stale')
        const list = this.addresses(batchId)
        const complete =
            list.length === record.uniqueAddressCount &&
            list.every(address => address.admissionKind !== null) &&
            list
                .filter(address => address.admissionKind === 'created')
                .every(
                    address =>
                        address.executionId !== null &&
                        this.views.executionOwnedBy(address.executionId, batchId, address.normalizedAddress),
                )
        if (!complete) return Promise.resolve('incomplete')
        this.touch(batchId, { state: 'funding' })
        return Promise.resolve('applied')
    }

    listOwnedExecutionIds(batchId: string): Promise<readonly string[]> {
        return Promise.resolve(
            this.sorted(batchId)
                .filter(address => address.admissionKind === 'created' && address.executionId !== null)
                .map(address => address.executionId!),
        )
    }

    recordFundingDecision(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        decision: 'approved' | 'denied',
    ): Promise<BatchAdmissionGuardedWrite> {
        const record = this.fenced(batchId, organizationId, fence)
        if (record?.state !== 'funding') return Promise.resolve('stale')
        if (record.fundingDecision === decision) return Promise.resolve('applied')
        if (record.fundingDecision !== 'pending') return Promise.resolve('stale')
        this.touch(batchId, { fundingDecision: decision })
        return Promise.resolve('applied')
    }

    markFinalizationReady(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite> {
        const record = this.fenced(batchId, organizationId, fence)
        if (!record || record.fundingDecision === 'closed') return Promise.resolve('stale')
        if (record.state !== 'admitted' && record.state !== 'insufficient_credits') return Promise.resolve('stale')
        const incomplete = this.addresses(batchId).some(
            address => address.admissionKind === null || this.isIncomplete(address, 'materialization'),
        )
        if (incomplete) return Promise.resolve('incomplete')
        this.touch(batchId, { finalizationState: 'ready' })
        return Promise.resolve('applied')
    }

    private sorted(batchId: string): BatchUniqueAddressRecord[] {
        return [...this.addresses(batchId)].sort((left, right) => left.firstSeenRow - right.firstSeenRow)
    }

    private isIncomplete(address: BatchUniqueAddressRecord, phase: BatchAdmissionPhase): boolean {
        switch (phase) {
            case 'resolution':
                return address.admissionKind === null
            case 'queue':
            case 'cancellation':
                return (
                    address.admissionKind === 'created' &&
                    address.executionId !== null &&
                    this.views.executionOwnedBy(address.executionId, address.batchId, address.normalizedAddress) &&
                    this.views.executionState(address.executionId) === 'funding_pending'
                )
            case 'materialization': {
                if (address.admissionKind === null) return false
                const organizationId = this.groups.get(address.batchId)?.organizationId ?? ''
                return (
                    address.payerRequestId === null || !this.views.receiptExists(address.payerRequestId, organizationId)
                )
            }
        }
    }
}

/**
 * Batch-owned execution claims keyed by `(organizationId, normalizedAddress)`, with the store adapter's fence checks:
 * claims require an `admitting` group, queuing an `approved` one, and cancellation a `denied` one.
 */
export class InMemoryBatchExecutions {
    readonly executions = new Map<string, VerificationExecutionRecord>()

    constructor(private readonly admissions: InMemoryBatchAdmissionStore) {}

    seedExecution(execution: VerificationExecutionRecord): void {
        this.executions.set(execution.executionId, execution)
    }

    views(receiptExists: (requestId: string, organizationId: string) => boolean): BatchAdmissionViews {
        return {
            executionState: executionId => this.executions.get(executionId)?.state,
            executionOwnedBy: (executionId, batchId, normalizedAddress) => {
                const execution = this.executions.get(executionId)
                return (
                    execution?.fundingOwnerType === 'batch_group' &&
                    execution.fundingOwnerId === batchId &&
                    execution.normalizedAddress === normalizedAddress
                )
            },
            receiptExists,
        }
    }

    claimOrJoinForBatchGroup(
        batchId: string,
        fence: BatchAdmissionFence,
        organizationId: string,
        normalizedAddress: string,
        payerRequestId: string,
        newExecutionId: string,
        deadlineAt: Date,
        _isCandidateUsable: (candidate: CachedResultCandidate) => boolean,
    ): Promise<BatchGroupClaimOutcome> {
        if (this.admissions.holdsFence(batchId, organizationId, fence)?.state !== 'admitting') {
            return Promise.resolve({ kind: 'stale-admission' })
        }
        const existing = [...this.executions.values()].find(
            execution =>
                execution.organizationId === organizationId &&
                execution.normalizedAddress === normalizedAddress &&
                execution.state !== 'completed' &&
                execution.state !== 'canceled',
        )
        if (existing) return Promise.resolve({ kind: 'joined', execution: existing })

        const execution: VerificationExecutionRecord = {
            executionId: newExecutionId,
            organizationId,
            normalizedAddress,
            payerRequestId,
            state: 'funding_pending',
            fundingOwnerType: 'batch_group',
            fundingOwnerId: batchId,
            attemptGeneration: 0,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            resultId: null,
            retryAt: null,
            deadlineAt,
            createdAt: fence.now,
            updatedAt: fence.now,
        }
        this.executions.set(newExecutionId, execution)
        return Promise.resolve({ kind: 'created', execution })
    }

    markBatchGroupQueued(
        executionId: string,
        organizationId: string,
        batchId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionGuardedWrite> {
        return this.transition(executionId, organizationId, batchId, fence, 'approved', 'queued')
    }

    cancelBatchGroupFundingPending(
        executionId: string,
        organizationId: string,
        batchId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionGuardedWrite> {
        return this.transition(executionId, organizationId, batchId, fence, 'denied', 'canceled')
    }

    private transition(
        executionId: string,
        organizationId: string,
        batchId: string,
        fence: BatchAdmissionFence,
        decision: 'approved' | 'denied',
        next: VerificationExecutionState,
    ): Promise<BatchAdmissionGuardedWrite> {
        const group = this.admissions.holdsFence(batchId, organizationId, fence)
        if (group?.state !== 'funding' || group.fundingDecision !== decision) return Promise.resolve('stale')
        const execution = this.executions.get(executionId)
        if (!execution || execution.fundingOwnerId !== batchId) {
            return Promise.reject(new Error('batch_admission_ownership_conflict'))
        }
        if (execution.state === 'funding_pending') this.executions.set(executionId, { ...execution, state: next })
        return Promise.resolve('applied')
    }
}
