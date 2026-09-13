import { DataSource } from 'typeorm'
import {
    InsertRequestOutcome,
    NewVerificationRequestInput,
    VerificationRequestRecord,
    VerificationRequestStore,
} from '../../application/ports/verification-request-store'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'

function toRecord(entity: VerificationRequestEntity): VerificationRequestRecord {
    return {
        requestId: entity.requestId,
        organizationId: entity.organizationId,
        normalizedAddress: entity.normalizedAddress,
        deliveryMode: entity.deliveryMode,
        clientRequestKey: entity.clientRequestKey,
        executionId: entity.executionId,
        resultId: entity.resultId,
        source: entity.source,
        billingState: entity.billingState,
        reservedCount: entity.reservedCount,
        chargedCount: entity.chargedCount,
        finalReason: entity.finalReason,
        createdAt: entity.createdAt,
        settledAt: entity.settledAt,
    }
}

export class TypeOrmVerificationRequestStore implements VerificationRequestStore {
    constructor(private readonly dataSource: DataSource) {}

    async findByClientKey(organizationId: string, clientRequestKey: string): Promise<VerificationRequestRecord | null> {
        const existing = await this.dataSource.manager.findOneBy(VerificationRequestEntity, {
            organizationId,
            clientRequestKey,
        })
        return existing ? toRecord(existing) : null
    }

    async insert(input: NewVerificationRequestInput): Promise<InsertRequestOutcome> {
        return this.dataSource.transaction(async manager => {
            if (input.clientRequestKey !== null) {
                const existing = await manager.findOne(VerificationRequestEntity, {
                    where: { organizationId: input.organizationId, clientRequestKey: input.clientRequestKey },
                    lock: { mode: 'pessimistic_write' },
                })
                if (existing) {
                    if (
                        existing.normalizedAddress !== input.normalizedAddress ||
                        existing.deliveryMode !== input.deliveryMode
                    ) {
                        return { kind: 'key-conflict' }
                    }
                    return { kind: 'replayed', record: toRecord(existing) }
                }
            }

            const inserted = await manager.save(
                VerificationRequestEntity,
                manager.create(VerificationRequestEntity, {
                    requestId: input.requestId,
                    organizationId: input.organizationId,
                    normalizedAddress: input.normalizedAddress,
                    deliveryMode: input.deliveryMode,
                    clientRequestKey: input.clientRequestKey,
                    executionId: input.executionId,
                    resultId: input.resultId,
                    source: input.source,
                    billingState: input.billingState,
                    reservedCount: input.reservedCount,
                    finalReason: input.finalReason,
                    settledAt: input.billingState === 'settled' ? new Date() : null,
                }),
            )
            return { kind: 'inserted', record: toRecord(inserted) }
        })
    }

    async findById(requestId: string, organizationId: string): Promise<VerificationRequestRecord | null> {
        const existing = await this.dataSource.manager.findOneBy(VerificationRequestEntity, {
            requestId,
            organizationId,
        })
        return existing ? toRecord(existing) : null
    }

    async attachExecution(requestId: string, organizationId: string, executionId: string): Promise<void> {
        await this.dataSource.manager.update(VerificationRequestEntity, { requestId, organizationId }, { executionId })
    }
}
