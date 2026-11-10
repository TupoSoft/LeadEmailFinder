import { DataSource } from 'typeorm'
import {
    InsertRequestOutcome,
    NewVerificationRequestInput,
    VerificationRequestRecord,
    VerificationRequestStore,
} from '../../application/ports/verification-request-store'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'

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
            // Serialize receipt materialization with completion: it must either be in settlement's linked-request
            // update, or inherit the already-terminal outcome instead of remaining pending forever.
            let joinedExecution: VerificationExecutionEntity | null = null

            if (input.executionId !== null) {
                joinedExecution = await manager.findOne(VerificationExecutionEntity, {
                    where: { executionId: input.executionId, organizationId: input.organizationId },
                    lock: { mode: 'pessimistic_write' },
                })
            }

            const completedJoin = joinedExecution?.state === 'completed'
            const canceledJoin = joinedExecution?.state === 'canceled'
            let intention: VerificationSettlementIntentionEntity | null = null

            if (joinedExecution?.state === 'completed') {
                intention = await manager.findOneBy(VerificationSettlementIntentionEntity, {
                    executionId: joinedExecution.executionId,
                    organizationId: input.organizationId,
                })
            }

            if (completedJoin && intention?.state !== 'confirmed') {
                throw new Error('verification_settlement_not_confirmed')
            }

            const payer = joinedExecution?.payerRequestId === input.requestId
            const capturedPayer = completedJoin && payer && intention?.decision === 'capture'

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

            let resultId = input.resultId
            let billingState = input.billingState
            let finalReason = input.finalReason

            if (joinedExecution?.state === 'completed') {
                resultId = joinedExecution.resultId
                billingState = 'settled'

                if (payer) {
                    finalReason = capturedPayer ? 'conclusive' : 'inconclusive'
                } else {
                    finalReason = 'shared'
                }
            } else if (canceledJoin) {
                resultId = null
                billingState = 'settled'
                finalReason = 'failed'
            }

            let settledAt: Date | null = null

            if (completedJoin || canceledJoin || input.billingState === 'settled') {
                settledAt = new Date()
            }

            const entity = manager.create(VerificationRequestEntity, {
                requestId: input.requestId,
                organizationId: input.organizationId,
                normalizedAddress: input.normalizedAddress,
                deliveryMode: input.deliveryMode,
                clientRequestKey: input.clientRequestKey,
                executionId: input.executionId,
                resultId,
                source: input.source,
                billingState,
                reservedCount: input.reservedCount,
                chargedCount: capturedPayer ? 1 : 0,
                finalReason,
                settledAt,
            })

            // Protect every existing UUID, including a batch receipt replayed with an incompatible mode or key.
            // Only primary-key conflicts replay here; client-key arbitration above retains its existing behavior.
            const inserted = await manager
                .createQueryBuilder()
                .insert()
                .into(VerificationRequestEntity)
                .values(entity)
                .onConflict('("requestId") DO NOTHING')
                .returning(['requestId'])
                .execute()
            const winner = await manager.findOneBy(VerificationRequestEntity, {
                requestId: input.requestId,
                organizationId: input.organizationId,
            })
            if (
                !winner ||
                winner.requestId !== input.requestId ||
                winner.organizationId !== input.organizationId ||
                winner.normalizedAddress !== input.normalizedAddress ||
                winner.deliveryMode !== input.deliveryMode ||
                winner.clientRequestKey !== input.clientRequestKey ||
                winner.source !== input.source ||
                winner.executionId !== input.executionId ||
                ((input.source === 'cache' || input.source === 'cooldown') && winner.resultId !== input.resultId)
            ) {
                const scope =
                    input.deliveryMode === 'batch' || winner?.deliveryMode === 'batch' ? 'batch' : 'verification'
                throw new Error(`${scope}_request_identity_conflict`)
            }
            const created = Array.isArray(inserted.raw) && inserted.raw.length > 0
            return { kind: created ? 'inserted' : 'replayed', record: toRecord(winner) }
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

    async settleCanceled(executionId: string, organizationId: string): Promise<void> {
        await this.dataSource.transaction(async manager => {
            const linkedRequests = await manager.find(VerificationRequestEntity, {
                where: { executionId, organizationId },
            })
            const now = new Date()
            const unsettled = linkedRequests.filter(request => request.billingState !== 'settled')
            for (const request of unsettled) {
                request.billingState = 'settled'
                request.resultId = null
                request.finalReason = 'failed'
                request.chargedCount = 0
                request.settledAt = now
            }
            if (unsettled.length > 0) {
                await manager.save(VerificationRequestEntity, unsettled)
            }
        })
    }
}
