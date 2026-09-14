import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm'
import { VerificationExecutionPermits } from '../../application/ports/verification-execution-permits'
import {
    VERIFICATION_EXECUTION_PERMIT_LOCK_ID,
    VerificationExecutionPermitLockEntity,
} from './typeorm/verification-execution-permit-lock.entity'
import { VerificationExecutionPermitEntity } from './typeorm/verification-execution-permit.entity'

const POSTGRES_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === POSTGRES_UNIQUE_VIOLATION
}

export class TypeOrmVerificationExecutionPermitStore implements VerificationExecutionPermits {
    constructor(private readonly dataSource: DataSource) {}

    async tryAcquire(
        leaseId: string,
        organizationId: string,
        now: Date,
        expiresAt: Date,
        maxConcurrent: number,
    ): Promise<boolean> {
        return this.dataSource.transaction(async manager => {
            await this.lockSingleton(manager)
            await manager.delete(VerificationExecutionPermitEntity, { expiresAt: LessThanOrEqual(now) })
            const activeCount = await manager.count(VerificationExecutionPermitEntity)
            if (activeCount >= maxConcurrent) return false

            await manager.save(
                VerificationExecutionPermitEntity,
                manager.create(VerificationExecutionPermitEntity, { leaseId, organizationId, expiresAt }),
            )
            return true
        })
    }

    async renew(leaseId: string, expiresAt: Date): Promise<boolean> {
        const result = await this.dataSource.manager.update(VerificationExecutionPermitEntity, { leaseId }, { expiresAt })
        return (result.affected ?? 0) > 0
    }

    async release(leaseId: string): Promise<void> {
        await this.dataSource.manager.delete(VerificationExecutionPermitEntity, { leaseId })
    }

    private async lockSingleton(manager: EntityManager): Promise<void> {
        try {
            // Bootstraps the singleton lock row lazily on first use. Nested in its own `manager.transaction()` so
            // TypeORM issues a savepoint: a caught unique-violation would otherwise poison the whole outer
            // transaction in Postgres, leaving every subsequent statement failing with "current transaction is
            // aborted" (verified against real Postgres — see the sibling fix in
            // `TypeOrmVerificationExecutionStore.claimOrJoin`).
            await manager.transaction(async nested =>
                nested.insert(VerificationExecutionPermitLockEntity, { id: VERIFICATION_EXECUTION_PERMIT_LOCK_ID }),
            )
        } catch (error) {
            if (!isUniqueViolation(error)) throw error
        }

        await manager.findOneOrFail(VerificationExecutionPermitLockEntity, {
            where: { id: VERIFICATION_EXECUTION_PERMIT_LOCK_ID },
            lock: { mode: 'pessimistic_write' },
        })
    }
}
