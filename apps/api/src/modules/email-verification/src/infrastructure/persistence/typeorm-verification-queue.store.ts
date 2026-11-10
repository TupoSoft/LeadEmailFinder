import type { VerificationCommand, VerificationResult } from '@tuposoft/lead-email-finder-verification-contracts'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import {
    buildWorkerVerification,
    VerificationEvidenceExpiredError,
} from '../../application/operations/verification-worker-result'
import { NewEmailVerification } from '../../domain/email-verification'
import { VerificationExecutionDispatcher } from '../../application/ports/verification-execution-dispatcher'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationCommandOutboxEntity } from './typeorm/verification-command-outbox.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { enqueueVerificationAttempt } from './verification-command-outbox'

export class TypeOrmVerificationQueueStore implements VerificationExecutionDispatcher {
    constructor(private readonly dataSource: DataSource) {}

    async dispatch(executionId: string, organizationId: string): Promise<void> {
        await this.dataSource.transaction(async manager => {
            const execution = await manager.findOne(VerificationExecutionEntity, {
                where: { executionId, organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            if (execution) {
                await enqueueVerificationAttempt(manager, execution, new Date())
            }
        })
    }

    async pendingCommands(limit: number): Promise<VerificationCommand[]> {
        const activeAttemptJoin = [
            'execution.executionId = outbox.executionId',
            'execution.organizationId = outbox.organizationId',
            'execution.activeAttemptId = outbox.attemptId',
        ].join(' AND ')

        const payerReceiptJoin = [
            'payer.requestId = execution.payerRequestId',
            'payer.organizationId = execution.organizationId',
            'payer.executionId = execution.executionId',
        ].join(' AND ')

        const rows = await this.dataSource.manager
            .createQueryBuilder(VerificationCommandOutboxEntity, 'outbox')
            .innerJoin(VerificationExecutionEntity, 'execution', activeAttemptJoin)
            // Batch funding can create the outbox before receipt materialization. Publishing must wait for
            // the payer so an immediate result cannot settle an execution without its billing receipt.
            .innerJoin(VerificationRequestEntity, 'payer', payerReceiptJoin)
            .where('outbox.publishedAt IS NULL')
            .andWhere('execution.state IN (:...states)', { states: ['queued', 'running'] })
            .andWhere('execution.deadlineAt > :now', { now: new Date() })
            .orderBy('outbox.createdAt', 'ASC')
            .take(limit)
            .getMany()

        return rows.map(row => row.command)
    }

    async markPublished(attemptId: string): Promise<void> {
        // Never mutate execution here: its result may arrive before the publish response does.
        await this.dataSource.manager.update(
            VerificationCommandOutboxEntity,
            { attemptId, publishedAt: IsNull() },
            { publishedAt: new Date() },
        )
    }

    async applyResult(message: VerificationResult, now: Date): Promise<'settle' | 'ignored' | 'retry-scheduled'> {
        return this.dataSource.transaction(async manager => {
            const execution = await manager.findOne(VerificationExecutionEntity, {
                where: { executionId: message.executionId, organizationId: message.organizationId },
                lock: { mode: 'pessimistic_write' },
            })

            // Lock acquisition can wait past the caller's timestamp; evaluate the deadline after the lock.
            const appliedAt = new Date(Math.max(now.getTime(), Date.now()))

            if (!execution || execution.activeAttemptId !== message.attemptId) {
                return 'ignored'
            }

            if (execution.state === 'settling' || execution.state === 'completed') {
                return 'settle'
            }

            if (execution.state === 'canceled' || execution.deadlineAt.getTime() <= appliedAt.getTime()) {
                return 'ignored'
            }

            if (execution.state !== 'queued' && execution.state !== 'running') {
                return 'ignored'
            }

            if (message.outcome === 'retryable-failure') {
                const delayMs =
                    message.failureReason === 'temporarily_blocked'
                        ? (execution.attemptGeneration + 1) * 60_000
                        : 10_000

                return this.scheduleRetry(manager, execution, appliedAt, delayMs)
            }

            let verification: NewEmailVerification

            try {
                verification = buildWorkerVerification(execution.normalizedAddress, message.result, appliedAt)
            } catch (error) {
                if (!(error instanceof VerificationEvidenceExpiredError)) {
                    throw error
                }

                // Valid cached evidence can expire while its result is in transit. Reprobe instead of
                // retrying the same expired result until it reaches the dead-letter queue.
                return this.scheduleRetry(manager, execution, appliedAt, 10_000)
            }

            const decision = verification.verificationQuality === 'inconclusive' ? 'release' : 'capture'
            const verificationEntity = manager.create(EmailVerificationEntity, {
                organizationId: execution.organizationId,
                ...verification,
            })
            const savedResult = await manager.save(EmailVerificationEntity, verificationEntity)

            const settlementIntention = manager.create(VerificationSettlementIntentionEntity, {
                executionId: execution.executionId,
                organizationId: execution.organizationId,
                decision,
                resultId: savedResult.id,
                state: 'pending',
                confirmedAt: null,
            })
            await manager.save(VerificationSettlementIntentionEntity, settlementIntention)

            execution.state = 'settling'
            execution.resultId = savedResult.id

            await manager.save(VerificationExecutionEntity, execution)

            return 'settle'
        })
    }

    private async scheduleRetry(
        manager: EntityManager,
        execution: VerificationExecutionEntity,
        now: Date,
        delayMs: number,
    ): Promise<'retry-scheduled'> {
        execution.attemptGeneration += 1
        execution.activeAttemptId = null
        execution.state = 'awaiting_retry'
        execution.retryAt = new Date(now.getTime() + delayMs)

        await manager.save(VerificationExecutionEntity, execution)

        return 'retry-scheduled'
    }
}
