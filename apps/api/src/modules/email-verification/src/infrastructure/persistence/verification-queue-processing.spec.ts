import { DataSource, EntityManager } from 'typeorm'
import type { VerificationResult } from '@tuposoft/lead-email-finder-verification-contracts'
import { TypeOrmVerificationQueueStore } from './typeorm-verification-queue.store'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationCommandOutboxEntity } from './typeorm/verification-command-outbox.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'

const now = new Date('2026-11-10T00:00:00.000Z')
const organizationId = '10000000-0000-4000-8000-000000000001'
const executionId = '20000000-0000-4000-8000-000000000001'
const attemptId = '30000000-0000-4000-8000-000000000001'

function execution(overrides: Partial<VerificationExecutionEntity> = {}): VerificationExecutionEntity {
    return {
        executionId,
        organizationId,
        normalizedAddress: 'person@example.test',
        payerRequestId: 'request-1',
        state: 'queued',
        fundingOwnerType: 'single',
        fundingOwnerId: executionId,
        attemptGeneration: 0,
        activeAttemptId: attemptId,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
        ...overrides,
    }
}

function result(): Extract<VerificationResult, { outcome: 'completed' }> {
    return {
        version: 1,
        executionId,
        organizationId,
        attemptId,
        outcome: 'completed',
        result: {
            exists: true,
            catchAll: false,
            reason: 'accepted_email',
            sources: ['mx'],
            targetEvidence: {
                kind: 'smtp_recipient_accepted',
                code: 250,
                observedAt: now.toISOString(),
                policyVersion: 1,
                origin: 'fresh',
                stage: 'rcpt_to',
                verifiedTransport: true,
                senderAccepted: true,
            },
            controlEvidence: {
                kind: 'smtp_recipient_missing',
                code: 550,
                enhancedCode: '5.1.1',
                observedAt: now.toISOString(),
                policyVersion: 1,
                origin: 'fresh',
                stage: 'rcpt_to',
                verifiedTransport: true,
                senderAccepted: true,
            },
        },
    }
}

describe('Verification queue processing', () => {
    let manager: {
        findOne: jest.Mock
        create: jest.Mock
        save: jest.Mock
        update: jest.Mock
    }
    let store: TypeOrmVerificationQueueStore

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(now)

        manager = {
            findOne: jest.fn().mockResolvedValue(execution()),
            create: jest.fn((_type: unknown, value: unknown) => value),
            save: jest.fn((_type: unknown, value: unknown) =>
                Promise.resolve({ id: 'result-1', ...(value as object) }),
            ),
            update: jest.fn().mockResolvedValue(undefined),
        }

        store = new TypeOrmVerificationQueueStore({
            manager,
            transaction: (work: (transaction: EntityManager) => Promise<unknown>) =>
                work(manager as unknown as EntityManager),
        } as unknown as DataSource)
    })

    afterEach(() => jest.useRealTimers())

    it('does not dispatch missing or terminal executions', async () => {
        manager.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(execution({ state: 'completed', activeAttemptId: null }))

        await store.dispatch(executionId, organizationId)
        await store.dispatch(executionId, organizationId)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('preserves a scheduled retry backoff when another caller redispatches', async () => {
        manager.findOne.mockResolvedValue(
            execution({ state: 'awaiting_retry', activeAttemptId: null, retryAt: new Date(now.getTime() + 1000) }),
        )

        await store.dispatch(executionId, organizationId)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('does not replace an active attempt on redispatch', async () => {
        await store.dispatch(executionId, organizationId)

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('derives capture from evidence and persists the result/intention together', async () => {
        const completed = result()
        completed.result.exists = false

        await expect(store.applyResult(completed, now)).resolves.toBe('settle')

        expect(manager.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ exists: true, verificationQuality: 'conclusive_positive' }),
        )
        expect(manager.save).toHaveBeenCalledWith(
            VerificationSettlementIntentionEntity,
            expect.objectContaining({ decision: 'capture', executionId, resultId: 'result-1' }),
        )
    })

    it('releases inconclusive results rather than trusting a positive worker verdict', async () => {
        const completed = result()
        completed.result.targetEvidence = { kind: 'none' }
        completed.result.controlEvidence = { kind: 'none' }

        await expect(store.applyResult(completed, now)).resolves.toBe('settle')

        expect(manager.save).toHaveBeenCalledWith(
            VerificationSettlementIntentionEntity,
            expect.objectContaining({ decision: 'release' }),
        )
    })

    it('schedules a greylist retry only once per accepted attempt', async () => {
        const row = execution()
        manager.findOne.mockResolvedValue(row)
        const retry: VerificationResult = {
            version: 1,
            executionId,
            organizationId,
            attemptId,
            outcome: 'retryable-failure',
            failureReason: 'temporarily_blocked',
        }

        await expect(store.applyResult(retry, now)).resolves.toBe('retry-scheduled')

        expect(row.retryAt).toEqual(new Date(now.getTime() + 60_000))
        expect(row.attemptGeneration).toBe(1)

        await expect(store.applyResult(retry, now)).resolves.toBe('ignored')

        expect(manager.save).toHaveBeenCalledTimes(1)
    })

    it('schedules a flat-delay retry for transient probe failure', async () => {
        const row = execution()
        manager.findOne.mockResolvedValue(row)

        await store.applyResult(
            {
                version: 1,
                executionId,
                organizationId,
                attemptId,
                outcome: 'retryable-failure',
                failureReason: 'probe_failed',
            },
            now,
        )

        expect(row.retryAt).toEqual(new Date(now.getTime() + 10_000))
        expect(row.activeAttemptId).toBeNull()
    })

    it('ignores a stale attempt before persisting any result or financial intention', async () => {
        manager.findOne.mockResolvedValue(execution({ activeAttemptId: 'new-attempt' }))

        await expect(store.applyResult(result(), now)).resolves.toBe('ignored')

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('rejects a late result at the deadline even before a recovery sweep runs', async () => {
        manager.findOne.mockResolvedValue(execution({ deadlineAt: now }))

        await expect(store.applyResult(result(), now)).resolves.toBe('ignored')

        expect(manager.save).not.toHaveBeenCalled()
    })

    it('marks only the outbox published so a fast result cannot be overwritten', async () => {
        await store.markPublished(attemptId)

        expect(manager.update).toHaveBeenCalledWith(
            VerificationCommandOutboxEntity,
            expect.objectContaining({ attemptId }),
            { publishedAt: now },
        )
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('creates an attempt and its self-contained command in the same transaction', async () => {
        const row = execution({ activeAttemptId: null })
        manager.findOne.mockResolvedValue(row)

        await store.dispatch(executionId, organizationId)

        expect(manager.save).toHaveBeenCalledWith(
            VerificationExecutionEntity,
            expect.objectContaining({ activeAttemptId: expect.any(String) }),
        )
        expect(manager.save).toHaveBeenCalledWith(
            VerificationCommandOutboxEntity,
            expect.objectContaining({
                attemptId: row.activeAttemptId,
                command: {
                    version: 1,
                    executionId,
                    organizationId,
                    attemptId: row.activeAttemptId,
                    email: row.normalizedAddress,
                    deadlineAt: row.deadlineAt.toISOString(),
                },
            }),
        )

        await store.dispatch(executionId, organizationId)

        expect(manager.save).toHaveBeenCalledTimes(2)
    })
})
