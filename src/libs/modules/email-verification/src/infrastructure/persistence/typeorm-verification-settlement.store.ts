import { DataSource } from 'typeorm'
import {
    PersistResultInput,
    PersistResultOutcome,
    VerificationSettlementIntentionRecord,
    VerificationSettlementStore,
} from '../../application/ports/verification-settlement-store'
import { VerificationFinalReason } from '../../application/ports/verification-request-store'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'

function toIntentionRecord(entity: VerificationSettlementIntentionEntity): VerificationSettlementIntentionRecord {
    return {
        executionId: entity.executionId,
        organizationId: entity.organizationId,
        decision: entity.decision,
        resultId: entity.resultId,
        state: entity.state,
        createdAt: entity.createdAt,
        confirmedAt: entity.confirmedAt,
    }
}

export class TypeOrmVerificationSettlementStore implements VerificationSettlementStore {
    constructor(private readonly dataSource: DataSource) {}

    async persistResultAndIntention(input: PersistResultInput): Promise<PersistResultOutcome> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOneOrFail(VerificationExecutionEntity, {
                where: { executionId: input.executionId, organizationId: input.organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            const existingIntention = await manager.findOneBy(VerificationSettlementIntentionEntity, {
                executionId: input.executionId,
            })
            if (existingIntention) {
                return {
                    kind: 'already-persisted',
                    resultId: existingIntention.resultId,
                    intention: toIntentionRecord(existingIntention),
                }
            }

            if (execution.state === 'completed' || execution.state === 'canceled') {
                return { kind: 'terminal' }
            }
            if (execution.attemptGeneration !== input.expectedGeneration) {
                return { kind: 'stale-generation' }
            }

            const savedResult = await manager.save(
                EmailVerificationEntity,
                manager.create(EmailVerificationEntity, {
                    organizationId: input.organizationId,
                    ...input.newVerification,
                }),
            )

            const intention = await manager.save(
                VerificationSettlementIntentionEntity,
                manager.create(VerificationSettlementIntentionEntity, {
                    executionId: input.executionId,
                    organizationId: input.organizationId,
                    decision: input.decision,
                    resultId: savedResult.id,
                    state: 'pending',
                    confirmedAt: null,
                }),
            )

            execution.state = 'settling'
            execution.resultId = savedResult.id
            await manager.save(VerificationExecutionEntity, execution)

            return { kind: 'persisted', resultId: savedResult.id, intention: toIntentionRecord(intention) }
        })
    }

    async findIntention(
        executionId: string,
        organizationId: string,
    ): Promise<VerificationSettlementIntentionRecord | null> {
        const existing = await this.dataSource.manager.findOneBy(VerificationSettlementIntentionEntity, {
            executionId,
            organizationId,
        })
        return existing ? toIntentionRecord(existing) : null
    }

    async confirmSettlement(executionId: string, organizationId: string): Promise<{ readonly resultId: string }> {
        return this.dataSource.transaction(async manager => {
            const intention = await manager.findOneOrFail(VerificationSettlementIntentionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            if (intention.state === 'confirmed') {
                return { resultId: intention.resultId }
            }

            const execution = await manager.findOneOrFail(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            intention.state = 'confirmed'
            intention.confirmedAt = new Date()
            await manager.save(VerificationSettlementIntentionEntity, intention)

            execution.state = 'completed'
            await manager.save(VerificationExecutionEntity, execution)

            const finalReason: VerificationFinalReason = intention.decision === 'capture' ? 'conclusive' : 'inconclusive'
            const linkedRequests = await manager.find(VerificationRequestEntity, {
                where: { executionId, organizationId },
            })
            const now = new Date()
            for (const request of linkedRequests) {
                request.billingState = 'settled'
                request.resultId = intention.resultId
                request.finalReason = request.requestId === execution.payerRequestId ? finalReason : 'shared'
                request.chargedCount = request.requestId === execution.payerRequestId && intention.decision === 'capture' ? 1 : 0
                request.settledAt = now
            }
            if (linkedRequests.length > 0) {
                await manager.save(VerificationRequestEntity, linkedRequests)
            }

            return { resultId: intention.resultId }
        })
    }

    async pagePendingIntentions(limit: number): Promise<readonly VerificationSettlementIntentionRecord[]> {
        const rows = await this.dataSource.manager.find(VerificationSettlementIntentionEntity, {
            where: { state: 'pending' },
            order: { createdAt: 'ASC' },
            take: limit,
        })
        return rows.map(toIntentionRecord)
    }
}
