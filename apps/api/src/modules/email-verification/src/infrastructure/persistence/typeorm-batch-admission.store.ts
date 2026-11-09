import { Brackets, DataSource, EntityManager, IsNull, SelectQueryBuilder } from 'typeorm'
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
} from '../../application/delivery/batch/batch-admission-store'
import { BatchAdmissionEntity } from './typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from './typeorm/batch-unique-address.entity'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { lockFencedAdmission } from './batch-admission-fence'

const RECOVERABLE_ADMISSION_STATES = [
    'validating',
    'admitting',
    'funding',
] as const satisfies readonly BatchAdmissionState[]
const FINALIZING_ADMISSION_STATES = [
    'admitted',
    'insufficient_credits',
] as const satisfies readonly BatchAdmissionState[]

/** Restricts `address` rows to created addresses whose owned execution is still waiting for its group decision. */
function whereOwnedExecutionFundingPending(query: SelectQueryBuilder<BatchUniqueAddressEntity>): void {
    query.andWhere("address.admissionKind = 'created'").andWhere(qb => {
        const subQuery = qb
            .subQuery()
            .select('1')
            .from(VerificationExecutionEntity, 'execution')
            .where('execution.executionId = address.executionId')
            .andWhere('execution.organizationId = address.organizationId')
            .andWhere("execution.fundingOwnerType = 'batch_group'")
            .andWhere('execution.fundingOwnerId = address.batchId')
            .andWhere("execution.state = 'funding_pending'")
            .getQuery()
        return `EXISTS (${subQuery})`
    })
}

/** Restricts `address` rows to resolved addresses whose receipt row does not exist yet. */
function whereReceiptMissing(query: SelectQueryBuilder<BatchUniqueAddressEntity>): void {
    const receipt = query
        .subQuery()
        .select('1')
        .from(VerificationRequestEntity, 'request')
        .where('request.requestId = address.payerRequestId')
        .andWhere('request.organizationId = address.organizationId')
        .getQuery()
    query.andWhere('address.admissionKind IS NOT NULL').andWhere(
        new Brackets(missing => {
            missing.where('address.payerRequestId IS NULL').orWhere(`NOT EXISTS (${receipt})`)
        }),
    )
}

function addressQuery(
    manager: EntityManager,
    batchId: string,
    organizationId: string,
): SelectQueryBuilder<BatchUniqueAddressEntity> {
    return manager
        .createQueryBuilder(BatchUniqueAddressEntity, 'address')
        .where('address.batchId = :batchId', { batchId })
        .andWhere('address.organizationId = :organizationId', { organizationId })
}

function toAdmissionRecord(entity: BatchAdmissionEntity): BatchAdmissionRecord {
    return {
        batchId: entity.batchId,
        organizationId: entity.organizationId,
        state: entity.state,
        fundingDecision: entity.fundingDecision,
        finalizationState: entity.finalizationState,
        admissionLeaseOwnerId: entity.admissionLeaseOwnerId,
        admissionLeaseExpiresAt: entity.admissionLeaseExpiresAt,
        admissionGeneration: entity.admissionGeneration,
        totalRows: entity.totalRows,
        uniqueAddressCount: entity.uniqueAddressCount,
        clientRequestKey: entity.clientRequestKey,
        contentDigest: entity.contentDigest,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}

function toUniqueAddressRecord(entity: BatchUniqueAddressEntity): BatchUniqueAddressRecord {
    return {
        batchId: entity.batchId,
        normalizedAddress: entity.normalizedAddress,
        firstSeenRow: entity.firstSeenRow,
        admissionKind: entity.admissionKind,
        executionId: entity.executionId,
        resultId: entity.resultId,
        payerRequestId: entity.payerRequestId,
    }
}

export class TypeOrmBatchAdmissionStore implements BatchAdmissionStore {
    constructor(private readonly dataSource: DataSource) {}

    async createOrReplay(input: NewBatchAdmissionInput): Promise<CreateBatchAdmissionOutcome> {
        return this.dataSource.transaction(async manager => {
            // A BullMQ attempt retry of the same job (same batchId) must resume the same row rather than fail on
            // the primary-key conflict — this is what makes Validate safe to repeat after a worker crash.
            const existingById = await manager.findOneBy(BatchAdmissionEntity, {
                batchId: input.batchId,
                organizationId: input.organizationId,
            })
            if (existingById) return { kind: 'replayed', record: toAdmissionRecord(existingById) }

            if (input.clientRequestKey !== null) {
                const existing = await manager.findOneBy(BatchAdmissionEntity, {
                    organizationId: input.organizationId,
                    clientRequestKey: input.clientRequestKey,
                })
                if (existing) {
                    if (existing.contentDigest !== input.contentDigest) return { kind: 'key-conflict' }
                    return { kind: 'replayed', record: toAdmissionRecord(existing) }
                }
            }

            const entity = manager.create(BatchAdmissionEntity, {
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
            })
            const saved = await manager.save(BatchAdmissionEntity, entity)
            return { kind: 'created', record: toAdmissionRecord(saved) }
        })
    }

    async findById(batchId: string, organizationId: string): Promise<BatchAdmissionRecord | null> {
        const entity = await this.dataSource.manager.findOneBy(BatchAdmissionEntity, { batchId, organizationId })
        return entity ? toAdmissionRecord(entity) : null
    }

    async findByClientKey(organizationId: string, clientRequestKey: string): Promise<BatchAdmissionRecord | null> {
        const entity = await this.dataSource.manager.findOneBy(BatchAdmissionEntity, {
            organizationId,
            clientRequestKey,
        })
        return entity ? toAdmissionRecord(entity) : null
    }

    async insertUniqueAddresses(
        batchId: string,
        organizationId: string,
        addresses: readonly { normalizedAddress: string; firstSeenRow: number }[],
    ): Promise<void> {
        if (addresses.length === 0) return
        await this.dataSource
            .createQueryBuilder()
            .insert()
            .into(BatchUniqueAddressEntity)
            .values(
                addresses.map(address => ({
                    batchId,
                    organizationId,
                    normalizedAddress: address.normalizedAddress,
                    firstSeenRow: address.firstSeenRow,
                    admissionKind: null,
                    executionId: null,
                    resultId: null,
                    payerRequestId: null,
                })),
            )
            .orIgnore()
            .execute()
    }

    async pageUniqueAddresses(
        batchId: string,
        organizationId: string,
        skip: number,
        take: number,
    ): Promise<readonly BatchUniqueAddressRecord[]> {
        const entities = await this.dataSource.manager.find(BatchUniqueAddressEntity, {
            where: { batchId, organizationId },
            order: { firstSeenRow: 'ASC' },
            skip,
            take,
        })
        return entities.map(toUniqueAddressRecord)
    }

    async recordAdmissionOutcome(
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
        return this.dataSource.transaction(async manager => {
            // The shared lock blocks a concurrent freeze or takeover until this outcome commits.
            const admission = await lockFencedAdmission(manager, batchId, organizationId, fence, 'read')
            if (admission?.state !== 'admitting') return 'stale'
            await manager.update(
                BatchUniqueAddressEntity,
                { batchId, organizationId, normalizedAddress, admissionKind: IsNull() },
                { admissionKind: outcome.admissionKind, executionId: outcome.executionId, resultId: outcome.resultId },
            )
            return 'applied'
        })
    }

    async ensurePayerRequestId(
        batchId: string,
        organizationId: string,
        normalizedAddress: string,
        candidateId: string,
    ): Promise<string> {
        const identity = { batchId, organizationId, normalizedAddress }
        // Concurrent updates serialize on this row; after the first assignment, the NULL predicate prevents
        // every later candidate from replacing the committed identity.
        await this.dataSource.manager.update(
            BatchUniqueAddressEntity,
            { ...identity, payerRequestId: IsNull() },
            { payerRequestId: candidateId },
        )
        const address = await this.dataSource.manager.findOneBy(BatchUniqueAddressEntity, identity)
        if (!address?.payerRequestId) throw new Error('batch_payer_identity_missing')
        return address.payerRequestId
    }

    async countUnsettledAddresses(batchId: string, organizationId: string): Promise<number> {
        const missingPayerRequest = await this.dataSource.manager.count(BatchUniqueAddressEntity, {
            where: { batchId, organizationId, payerRequestId: IsNull() },
        })

        const unsettledPayerRequests = await this.dataSource.manager
            .createQueryBuilder(BatchUniqueAddressEntity, 'address')
            .where('address.batchId = :batchId', { batchId })
            .andWhere('address.organizationId = :organizationId', { organizationId })
            .andWhere('address.payerRequestId IS NOT NULL')
            .andWhere(qb => {
                const subQuery = qb
                    .subQuery()
                    .select('1')
                    .from(VerificationRequestEntity, 'request')
                    .where('request.requestId = address.payerRequestId')
                    .andWhere("request.billingState = 'settled'")
                    .getQuery()
                return `NOT EXISTS (${subQuery})`
            })
            .getCount()

        return missingPayerRequest + unsettledPayerRequests
    }

    async getStatusCounts(batchId: string, organizationId: string): Promise<BatchStatusCounts> {
        const raw = await this.dataSource.manager
            .createQueryBuilder(BatchUniqueAddressEntity, 'address')
            .leftJoin(VerificationRequestEntity, 'request', 'request.requestId = address.payerRequestId')
            .select("SUM(CASE WHEN address.admissionKind = 'cache' THEN 1 ELSE 0 END)", 'cachedAddresses')
            .addSelect("SUM(CASE WHEN address.admissionKind = 'shared' THEN 1 ELSE 0 END)", 'sharedAddresses')
            .addSelect("SUM(CASE WHEN address.admissionKind = 'cooldown' THEN 1 ELSE 0 END)", 'cooldownAddresses')
            .addSelect("SUM(CASE WHEN request.billingState = 'settled' THEN 1 ELSE 0 END)", 'completedAddresses')
            .addSelect(
                "SUM(CASE WHEN address.admissionKind = 'created' AND request.finalReason = 'conclusive' THEN 1 ELSE 0 END)",
                'conclusiveAddresses',
            )
            .addSelect(
                "SUM(CASE WHEN address.admissionKind = 'created' AND request.finalReason = 'inconclusive' THEN 1 ELSE 0 END)",
                'inconclusiveAddresses',
            )
            .addSelect(
                "SUM(CASE WHEN address.admissionKind = 'created' AND request.finalReason = 'failed' THEN 1 ELSE 0 END)",
                'failedAddresses',
            )
            .addSelect('COALESCE(SUM(request.reservedCount), 0)', 'reserved')
            .addSelect('COALESCE(SUM(request.chargedCount), 0)', 'charged')
            .where('address.batchId = :batchId', { batchId })
            .andWhere('address.organizationId = :organizationId', { organizationId })
            .getRawOne<Record<string, string | null>>()

        const toCount = (value: string | null | undefined): number => Number(value ?? 0)

        return {
            cachedAddresses: toCount(raw?.cachedAddresses),
            sharedAddresses: toCount(raw?.sharedAddresses),
            cooldownAddresses: toCount(raw?.cooldownAddresses),
            completedAddresses: toCount(raw?.completedAddresses),
            conclusiveAddresses: toCount(raw?.conclusiveAddresses),
            inconclusiveAddresses: toCount(raw?.inconclusiveAddresses),
            failedAddresses: toCount(raw?.failedAddresses),
            reserved: toCount(raw?.reserved),
            charged: toCount(raw?.charged),
        }
    }

    async claimAdmissionLease(
        batchId: string,
        organizationId: string,
        ownerId: string,
        now: Date,
        leaseExpiresAt: Date,
    ): Promise<BatchAdmissionLeaseOutcome> {
        return this.dataSource.transaction(async manager => {
            const admission = await manager.findOne(BatchAdmissionEntity, {
                where: { batchId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!admission) throw new Error('batch_admission_not_found')

            const heldByAnother =
                admission.admissionLeaseOwnerId !== null &&
                admission.admissionLeaseOwnerId !== ownerId &&
                admission.admissionLeaseExpiresAt !== null &&
                admission.admissionLeaseExpiresAt.getTime() > now.getTime()
            if (heldByAnother) return { kind: 'busy', leaseExpiresAt: admission.admissionLeaseExpiresAt! }

            admission.admissionLeaseOwnerId = ownerId
            admission.admissionLeaseExpiresAt = leaseExpiresAt
            admission.admissionGeneration += 1
            const saved = await manager.save(BatchAdmissionEntity, admission)
            return { kind: 'acquired', generation: saved.admissionGeneration, record: toAdmissionRecord(saved) }
        })
    }

    async renewAdmissionLease(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        leaseExpiresAt: Date,
    ): Promise<boolean> {
        const result = await this.dataSource
            .createQueryBuilder()
            .update(BatchAdmissionEntity)
            .set({ admissionLeaseExpiresAt: leaseExpiresAt })
            .where('batchId = :batchId', { batchId })
            .andWhere('organizationId = :organizationId', { organizationId })
            .andWhere('admissionLeaseOwnerId = :ownerId', { ownerId: fence.ownerId })
            .andWhere('admissionGeneration = :generation', { generation: fence.generation })
            .andWhere('admissionLeaseExpiresAt > :now', { now: fence.now })
            .execute()
        return (result.affected ?? 0) > 0
    }

    async releaseAdmissionLease(batchId: string, organizationId: string, fence: BatchAdmissionFence): Promise<void> {
        await this.dataSource
            .createQueryBuilder()
            .update(BatchAdmissionEntity)
            .set({ admissionLeaseOwnerId: null, admissionLeaseExpiresAt: null })
            .where('batchId = :batchId', { batchId })
            .andWhere('organizationId = :organizationId', { organizationId })
            .andWhere('admissionLeaseOwnerId = :ownerId', { ownerId: fence.ownerId })
            .andWhere('admissionGeneration = :generation', { generation: fence.generation })
            .execute()
    }

    async transitionState(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        from: BatchAdmissionState,
        to: BatchAdmissionState,
    ): Promise<BatchAdmissionGuardedWrite> {
        return this.dataSource.transaction(async manager => {
            const admission = await lockFencedAdmission(manager, batchId, organizationId, fence, 'write')
            if (admission?.state !== from) return 'stale'
            admission.state = to
            await manager.save(BatchAdmissionEntity, admission)
            return 'applied'
        })
    }

    async pageRecoverableGroups(now: Date, limit: number): Promise<readonly BatchAdmissionRecord[]> {
        const groups = await this.dataSource.manager
            .createQueryBuilder(BatchAdmissionEntity, 'admission')
            .where("admission.fundingDecision <> 'closed'")
            .andWhere(
                new Brackets(lease => {
                    lease
                        .where('admission.admissionLeaseOwnerId IS NULL')
                        .orWhere('admission.admissionLeaseExpiresAt IS NULL')
                        .orWhere('admission.admissionLeaseExpiresAt <= :now', { now })
                }),
            )
            .andWhere(
                new Brackets(work => {
                    work.where('admission.state IN (:...recoverable)', {
                        recoverable: RECOVERABLE_ADMISSION_STATES,
                    }).orWhere(
                        new Brackets(finalizing => {
                            finalizing
                                .where('admission.state IN (:...finalizing)', {
                                    finalizing: FINALIZING_ADMISSION_STATES,
                                })
                                .andWhere("admission.finalizationState = 'preparing'")
                        }),
                    )
                }),
            )
            .orderBy('admission.updatedAt', 'ASC')
            .addOrderBy('admission.batchId', 'ASC')
            .take(limit)
            .getMany()
        return groups.map(toAdmissionRecord)
    }

    async pageIncompleteAddresses(
        batchId: string,
        organizationId: string,
        phase: BatchAdmissionPhase,
        afterFirstSeenRow: number,
        limit: number,
    ): Promise<readonly BatchUniqueAddressRecord[]> {
        const query = addressQuery(this.dataSource.manager, batchId, organizationId).andWhere(
            'address.firstSeenRow > :afterFirstSeenRow',
            { afterFirstSeenRow },
        )
        switch (phase) {
            case 'resolution':
                query.andWhere('address.admissionKind IS NULL')
                break
            case 'queue':
            case 'cancellation':
                whereOwnedExecutionFundingPending(query)
                break
            case 'materialization':
                whereReceiptMissing(query)
                break
        }
        const addresses = await query.orderBy('address.firstSeenRow', 'ASC').take(limit).getMany()
        return addresses.map(toUniqueAddressRecord)
    }

    async freezeFundingManifest(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite> {
        return this.dataSource.transaction(async manager => {
            const admission = await lockFencedAdmission(manager, batchId, organizationId, fence, 'write')
            if (admission?.state !== 'admitting') return 'stale'

            const recorded = await addressQuery(manager, batchId, organizationId).getCount()
            const unresolved = await addressQuery(manager, batchId, organizationId)
                .andWhere('address.admissionKind IS NULL')
                .getCount()
            const unowned = await addressQuery(manager, batchId, organizationId)
                .andWhere("address.admissionKind = 'created'")
                .andWhere(qb => {
                    const subQuery = qb
                        .subQuery()
                        .select('1')
                        .from(VerificationExecutionEntity, 'execution')
                        .where('execution.executionId = address.executionId')
                        .andWhere('execution.organizationId = address.organizationId')
                        .andWhere('execution.normalizedAddress = address.normalizedAddress')
                        .andWhere("execution.fundingOwnerType = 'batch_group'")
                        .andWhere('execution.fundingOwnerId = address.batchId')
                        .getQuery()
                    return `NOT EXISTS (${subQuery})`
                })
                .getCount()
            if (recorded !== admission.uniqueAddressCount || unresolved > 0 || unowned > 0) return 'incomplete'

            admission.state = 'funding'
            await manager.save(BatchAdmissionEntity, admission)
            return 'applied'
        })
    }

    async listOwnedExecutionIds(batchId: string, organizationId: string): Promise<readonly string[]> {
        const rows = await addressQuery(this.dataSource.manager, batchId, organizationId)
            .andWhere("address.admissionKind = 'created'")
            .andWhere('address.executionId IS NOT NULL')
            .select('address.executionId', 'executionId')
            .orderBy('address.firstSeenRow', 'ASC')
            .getRawMany<{ executionId: string }>()
        return rows.map(row => row.executionId)
    }

    async recordFundingDecision(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
        decision: 'approved' | 'denied',
    ): Promise<BatchAdmissionGuardedWrite> {
        return this.dataSource.transaction(async manager => {
            const admission = await lockFencedAdmission(manager, batchId, organizationId, fence, 'write')
            if (admission?.state !== 'funding') return 'stale'
            if (admission.fundingDecision === decision) return 'applied'
            if (admission.fundingDecision !== 'pending') return 'stale'
            admission.fundingDecision = decision
            await manager.save(BatchAdmissionEntity, admission)
            return 'applied'
        })
    }

    async markFinalizationReady(
        batchId: string,
        organizationId: string,
        fence: BatchAdmissionFence,
    ): Promise<BatchAdmissionCheckedWrite> {
        return this.dataSource.transaction(async manager => {
            const admission = await lockFencedAdmission(manager, batchId, organizationId, fence, 'write')
            if (!admission || admission.fundingDecision === 'closed') return 'stale'
            if (admission.state !== 'admitted' && admission.state !== 'insufficient_credits') return 'stale'

            const missingReceipts = addressQuery(manager, batchId, organizationId)
            whereReceiptMissing(missingReceipts)
            const unresolved = await addressQuery(manager, batchId, organizationId)
                .andWhere('address.admissionKind IS NULL')
                .getCount()
            if (unresolved > 0 || (await missingReceipts.getCount()) > 0) return 'incomplete'

            admission.finalizationState = 'ready'
            await manager.save(BatchAdmissionEntity, admission)
            return 'applied'
        })
    }
}
