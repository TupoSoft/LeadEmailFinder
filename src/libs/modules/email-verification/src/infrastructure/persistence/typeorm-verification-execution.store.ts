import { DataSource, In } from 'typeorm'
import {
    CachedResultCandidate,
    ClaimAddressOutcome,
    VerificationExecutionRecord,
    VerificationExecutionStore,
} from '../../application/ports/verification-execution-store'
import { queryLatestCacheCandidate } from './verification-result-cache-query'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'

const NONTERMINAL_STATES = ['funding_pending', 'queued', 'running', 'awaiting_retry', 'settling'] as const
const POSTGRES_UNIQUE_VIOLATION = '23505'

function toRecord(entity: VerificationExecutionEntity): VerificationExecutionRecord {
    return {
        executionId: entity.executionId,
        organizationId: entity.organizationId,
        normalizedAddress: entity.normalizedAddress,
        payerRequestId: entity.payerRequestId,
        state: entity.state,
        fundingOwnerType: entity.fundingOwnerType,
        fundingOwnerId: entity.fundingOwnerId,
        attemptGeneration: entity.attemptGeneration,
        leaseOwnerId: entity.leaseOwnerId,
        leaseExpiresAt: entity.leaseExpiresAt,
        resultId: entity.resultId,
        retryAt: entity.retryAt,
        deadlineAt: entity.deadlineAt,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION
}

export class TypeOrmVerificationExecutionStore implements VerificationExecutionStore {
    constructor(private readonly dataSource: DataSource) {}

    async claimOrJoin(
        organizationId: string,
        normalizedAddress: string,
        payerRequestId: string,
        newExecutionId: string,
        deadlineAt: Date,
        isCandidateUsable: (candidate: CachedResultCandidate) => boolean,
    ): Promise<ClaimAddressOutcome> {
        return this.dataSource.transaction(async manager => {
            const existing = await manager.findOne(VerificationExecutionEntity, {
                where: { organizationId, normalizedAddress, state: In(NONTERMINAL_STATES) },
            })

            if (existing) {
                const locked = await manager.findOneOrFail(VerificationExecutionEntity, {
                    where: { executionId: existing.executionId },
                    lock: { mode: 'pessimistic_write' },
                })
                const candidate = await queryLatestCacheCandidate(manager, organizationId, normalizedAddress)
                if (candidate && isCandidateUsable(candidate)) {
                    return { kind: 'cache-available', resultId: candidate.resultId }
                }
                return { kind: 'joined', execution: toRecord(locked) }
            }

            let inserted: VerificationExecutionEntity
            try {
                // A caught unique-violation otherwise leaves the whole transaction unusable in Postgres (any
                // further statement fails with "current transaction is aborted"); nesting the risky insert in its
                // own `manager.transaction()` makes TypeORM issue a savepoint, so catching the violation here
                // rolls back only the insert and leaves the outer transaction free to keep reading/locking.
                inserted = await manager.transaction(async nested =>
                    nested.save(
                        VerificationExecutionEntity,
                        nested.create(VerificationExecutionEntity, {
                            executionId: newExecutionId,
                            organizationId,
                            normalizedAddress,
                            payerRequestId,
                            state: 'funding_pending',
                            fundingOwnerType: 'single',
                            fundingOwnerId: newExecutionId,
                            attemptGeneration: 0,
                            leaseOwnerId: null,
                            leaseExpiresAt: null,
                            resultId: null,
                            retryAt: null,
                            deadlineAt,
                        }),
                    ),
                )
            } catch (error) {
                if (!isUniqueViolation(error)) throw error
                const winner = await manager.findOneOrFail(VerificationExecutionEntity, {
                    where: { organizationId, normalizedAddress, state: In(NONTERMINAL_STATES) },
                    lock: { mode: 'pessimistic_write' },
                })
                const candidate = await queryLatestCacheCandidate(manager, organizationId, normalizedAddress)
                if (candidate && isCandidateUsable(candidate)) {
                    return { kind: 'cache-available', resultId: candidate.resultId }
                }
                return { kind: 'joined', execution: toRecord(winner) }
            }

            const candidate = await queryLatestCacheCandidate(manager, organizationId, normalizedAddress)
            if (candidate && isCandidateUsable(candidate)) {
                await manager.delete(VerificationExecutionEntity, { executionId: newExecutionId })
                return { kind: 'cache-available', resultId: candidate.resultId }
            }
            return { kind: 'created', execution: toRecord(inserted) }
        })
    }

    async findById(executionId: string, organizationId: string): Promise<VerificationExecutionRecord | null> {
        const existing = await this.dataSource.manager.findOneBy(VerificationExecutionEntity, {
            executionId,
            organizationId,
        })
        return existing ? toRecord(existing) : null
    }

    async markQueued(executionId: string, organizationId: string): Promise<VerificationExecutionRecord> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOneOrFail(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (execution.state === 'funding_pending') {
                execution.state = 'queued'
                await manager.save(VerificationExecutionEntity, execution)
            }
            return toRecord(execution)
        })
    }

    async cancelFundingFailure(executionId: string, organizationId: string): Promise<VerificationExecutionRecord> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOneOrFail(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (execution.state === 'funding_pending') {
                execution.state = 'canceled'
                await manager.save(VerificationExecutionEntity, execution)
            }
            return toRecord(execution)
        })
    }

    async acquireLease(
        executionId: string,
        organizationId: string,
        leaseOwnerId: string,
        leaseExpiresAt: Date,
        now: Date,
    ): Promise<VerificationExecutionRecord | null> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOne(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!execution) return null
            if (execution.state !== 'queued' && execution.state !== 'awaiting_retry') return null
            if (execution.state === 'awaiting_retry' && execution.retryAt !== null && execution.retryAt.getTime() > now.getTime())
                return null

            execution.state = 'running'
            execution.leaseOwnerId = leaseOwnerId
            execution.leaseExpiresAt = leaseExpiresAt
            await manager.save(VerificationExecutionEntity, execution)
            return toRecord(execution)
        })
    }

    async renewLease(
        executionId: string,
        organizationId: string,
        leaseOwnerId: string,
        generation: number,
        leaseExpiresAt: Date,
    ): Promise<VerificationExecutionRecord | null> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOne(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!execution) return null
            if (execution.state !== 'running') return null
            if (execution.attemptGeneration !== generation) return null
            if (execution.leaseOwnerId !== leaseOwnerId) return null

            execution.leaseExpiresAt = leaseExpiresAt
            await manager.save(VerificationExecutionEntity, execution)
            return toRecord(execution)
        })
    }

    async takeoverForRetry(
        executionId: string,
        organizationId: string,
        expectedGeneration: number,
        retryAt: Date | null,
    ): Promise<VerificationExecutionRecord | null> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOne(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (!execution) return null
            if (execution.state === 'completed' || execution.state === 'canceled') return null
            if (execution.attemptGeneration !== expectedGeneration) return null

            execution.attemptGeneration += 1
            execution.leaseOwnerId = null
            execution.leaseExpiresAt = null
            execution.state = retryAt !== null ? 'awaiting_retry' : 'queued'
            execution.retryAt = retryAt
            await manager.save(VerificationExecutionEntity, execution)
            return toRecord(execution)
        })
    }

    async cancelIfNoCaptureIntention(executionId: string, organizationId: string): Promise<VerificationExecutionRecord> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOneOrFail(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })
            if (execution.state === 'completed' || execution.state === 'canceled') return toRecord(execution)

            // An intention of either decision means settlement has already been decided; deadline/reconciler
            // cancellation must defer to it rather than override a capture already underway.
            const intention = await manager.findOneBy(VerificationSettlementIntentionEntity, { executionId })
            if (intention) return toRecord(execution)

            execution.state = 'canceled'
            execution.leaseOwnerId = null
            execution.leaseExpiresAt = null
            await manager.save(VerificationExecutionEntity, execution)
            return toRecord(execution)
        })
    }

    async pageNonterminal(limit: number): Promise<readonly VerificationExecutionRecord[]> {
        const rows = await this.dataSource.manager.find(VerificationExecutionEntity, {
            where: { state: In(NONTERMINAL_STATES), fundingOwnerType: 'single' },
            order: { updatedAt: 'ASC' },
            take: limit,
        })
        return rows.map(toRecord)
    }

    async pageCanceledPendingCleanup(limit: number): Promise<readonly VerificationExecutionRecord[]> {
        const rows = await this.dataSource.manager
            .createQueryBuilder(VerificationExecutionEntity, 'execution')
            .where('execution.state = :state', { state: 'canceled' })
            .andWhere('execution.fundingOwnerType = :fundingOwnerType', { fundingOwnerType: 'single' })
            .andWhere(qb => {
                const subQuery = qb
                    .subQuery()
                    .select('1')
                    .from(VerificationRequestEntity, 'request')
                    .where('request.executionId = execution.executionId')
                    .andWhere("request.billingState = 'pending'")
                    .getQuery()
                return `EXISTS (${subQuery})`
            })
            .orderBy('execution.updatedAt', 'ASC')
            .take(limit)
            .getMany()
        return rows.map(toRecord)
    }
}
