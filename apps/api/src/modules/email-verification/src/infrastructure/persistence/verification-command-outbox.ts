import { randomUUID } from 'node:crypto'
import { EntityManager } from 'typeorm'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationCommandOutboxEntity } from './typeorm/verification-command-outbox.entity'

/** Caller holds the execution lock. Allocate an attempt only once; network uncertainty never replaces it. */
export async function enqueueVerificationAttempt(
    manager: EntityManager,
    execution: VerificationExecutionEntity,
    now: Date,
): Promise<void> {
    if (execution.activeAttemptId || execution.deadlineAt.getTime() <= now.getTime()) {
        return
    }
    if (execution.state !== 'queued' && execution.state !== 'awaiting_retry') {
        return
    }
    if (execution.retryAt && execution.retryAt.getTime() > now.getTime()) {
        return
    }

    const attemptId = randomUUID()

    execution.activeAttemptId = attemptId
    execution.state = 'queued'
    execution.retryAt = null

    await manager.save(VerificationExecutionEntity, execution)

    const command = {
        version: 1 as const,
        executionId: execution.executionId,
        organizationId: execution.organizationId,
        attemptId,
        email: execution.normalizedAddress,
        deadlineAt: execution.deadlineAt.toISOString(),
    }

    await manager.save(
        VerificationCommandOutboxEntity,
        manager.create(VerificationCommandOutboxEntity, {
            attemptId,
            executionId: execution.executionId,
            organizationId: execution.organizationId,
            publishedAt: null,
            command,
        }),
    )
}
