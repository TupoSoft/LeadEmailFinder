import { DataSource, IsNull } from 'typeorm'
import {
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
import { VerificationRequestEntity } from './typeorm/verification-request.entity'

function toAdmissionRecord(entity: BatchAdmissionEntity): BatchAdmissionRecord {
    return {
        batchId: entity.batchId,
        organizationId: entity.organizationId,
        state: entity.state,
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

    async updateState(batchId: string, organizationId: string, state: BatchAdmissionState): Promise<void> {
        await this.dataSource.manager.update(BatchAdmissionEntity, { batchId, organizationId }, { state })
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
        normalizedAddress: string,
        outcome: {
            readonly admissionKind: BatchUniqueAddressAdmissionKind
            readonly executionId: string | null
            readonly resultId: string | null
        },
    ): Promise<void> {
        await this.dataSource.manager.update(
            BatchUniqueAddressEntity,
            { batchId, normalizedAddress, admissionKind: IsNull() },
            { admissionKind: outcome.admissionKind, executionId: outcome.executionId, resultId: outcome.resultId },
        )
    }

    async recordPayerRequestId(batchId: string, normalizedAddress: string, payerRequestId: string): Promise<void> {
        await this.dataSource.manager.update(BatchUniqueAddressEntity, { batchId, normalizedAddress }, { payerRequestId })
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
}
