import { DataSource, EntityManager } from 'typeorm'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { TypeOrmVerificationExecutionStore } from './typeorm-verification-execution.store'

const organizationId = '10000000-0000-4000-8000-000000000001'
const address = 'person@example.test'
const deadlineAt = new Date('2026-09-12T00:00:00.000Z')

function execution(overrides: Partial<VerificationExecutionEntity> = {}): VerificationExecutionEntity {
    return {
        executionId: 'execution-1',
        organizationId,
        normalizedAddress: address,
        payerRequestId: 'request-1',
        state: 'funding_pending',
        fundingOwnerType: 'single',
        fundingOwnerId: 'execution-1',
        attemptGeneration: 0,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        resultId: null,
        retryAt: null,
        deadlineAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as VerificationExecutionEntity
}

describe('TypeOrmVerificationExecutionStore', () => {
    let manager: {
        findOne: jest.Mock
        findOneOrFail: jest.Mock
        findOneBy: jest.Mock
        find: jest.Mock
        create: jest.Mock
        save: jest.Mock
        delete: jest.Mock
        transaction: jest.Mock
        createQueryBuilder: jest.Mock
        query: jest.Mock
    }
    let store: TypeOrmVerificationExecutionStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            findOneBy: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((_entityClass: unknown, value: unknown) => value),
            save: jest.fn((_entityClass: unknown, value: unknown) => Promise.resolve(value)),
            delete: jest.fn(),
            transaction: jest.fn(),
            createQueryBuilder: jest.fn(),
            query: jest.fn().mockResolvedValue(undefined),
        }
        manager.transaction.mockImplementation(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmVerificationExecutionStore({
            transaction,
            manager: manager as unknown as EntityManager,
        } as unknown as DataSource)
    })

    const alwaysUsable = (): boolean => true
    const neverUsable = (): boolean => false

    describe('claimOrJoin', () => {
        it('creates a new funding_pending execution when no cache and no active execution exist', async () => {
            manager.findOne.mockResolvedValueOnce(null) // no existing nonterminal execution
            manager.findOne.mockImplementation((entityClass: unknown) =>
                entityClass === EmailVerificationEntity ? Promise.resolve(null) : Promise.resolve(null),
            )
            const outcome = await store.claimOrJoin(
                organizationId,
                address,
                'request-1',
                'execution-1',
                deadlineAt,
                alwaysUsable,
            )
            expect(outcome.kind).toBe('created')
        })

        it('serializes admission with a transaction-scoped advisory lock keyed on the organization', async () => {
            manager.findOne.mockResolvedValue(null)
            await store.claimOrJoin(organizationId, address, 'request-1', 'execution-1', deadlineAt, alwaysUsable)
            expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [organizationId])
        })

        it('defaults the funding owner to single, owned by the new execution id', async () => {
            manager.findOne.mockResolvedValue(null)
            await store.claimOrJoin(organizationId, address, 'request-1', 'execution-1', deadlineAt, alwaysUsable)
            expect(manager.create).toHaveBeenCalledWith(
                VerificationExecutionEntity,
                expect.objectContaining({ fundingOwnerType: 'single', fundingOwnerId: 'execution-1' }),
            )
        })

        it('claims a new execution owned by a batch group when a funding owner is supplied', async () => {
            manager.findOne.mockResolvedValue(null)
            await store.claimOrJoin(organizationId, address, 'request-1', 'execution-1', deadlineAt, alwaysUsable, {
                type: 'batch_group',
                id: 'batch-1',
            })
            expect(manager.create).toHaveBeenCalledWith(
                VerificationExecutionEntity,
                expect.objectContaining({ fundingOwnerType: 'batch_group', fundingOwnerId: 'batch-1' }),
            )
        })

        it('reports cache-available and deletes its own optimistic insert when a fresh cache result appears under lock', async () => {
            manager.findOne.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationExecutionEntity) return Promise.resolve(null)
                return Promise.resolve({ id: 'result-1', verificationQuality: 'conclusive_positive' })
            })
            const outcome = await store.claimOrJoin(
                organizationId,
                address,
                'request-1',
                'execution-1',
                deadlineAt,
                alwaysUsable,
            )
            expect(outcome).toEqual({ kind: 'cache-available', resultId: 'result-1' })
            expect(manager.delete).toHaveBeenCalledWith(VerificationExecutionEntity, { executionId: 'execution-1' })
        })

        it('joins an existing nonterminal execution for the address', async () => {
            manager.findOne.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationExecutionEntity) return Promise.resolve(execution())
                return Promise.resolve(null)
            })
            manager.findOneOrFail.mockResolvedValue(execution())
            const outcome = await store.claimOrJoin(
                organizationId,
                address,
                'request-2',
                'execution-2',
                deadlineAt,
                neverUsable,
            )
            expect(outcome).toEqual({ kind: 'joined', execution: expect.objectContaining({ executionId: 'execution-1' }) })
        })

        it('joins the winner when a concurrent insert races and loses to a unique violation', async () => {
            manager.findOne.mockImplementation((entityClass: unknown) => {
                if (entityClass === VerificationExecutionEntity) return Promise.resolve(null)
                return Promise.resolve(null)
            })
            manager.save.mockRejectedValueOnce({ code: '23505' })
            manager.findOneOrFail.mockResolvedValue(execution())
            const outcome = await store.claimOrJoin(
                organizationId,
                address,
                'request-2',
                'execution-2',
                deadlineAt,
                neverUsable,
            )
            expect(outcome).toEqual({ kind: 'joined', execution: expect.objectContaining({ executionId: 'execution-1' }) })
        })

        it('rethrows an unexpected save error rather than treating it as a race', async () => {
            manager.findOne.mockResolvedValue(null)
            manager.save.mockRejectedValueOnce(new Error('unexpected'))
            await expect(
                store.claimOrJoin(organizationId, address, 'request-1', 'execution-1', deadlineAt, neverUsable),
            ).rejects.toThrow('unexpected')
        })
    })

    describe('cancelIfNoCaptureIntention', () => {
        it('cancels and frees the address slot when no settlement intention exists', async () => {
            manager.findOneOrFail.mockImplementation((entityClass: unknown) =>
                entityClass === VerificationExecutionEntity ? Promise.resolve(execution({ state: 'running' })) : Promise.resolve(null),
            )
            manager.findOneBy.mockResolvedValue(null)
            const result = await store.cancelIfNoCaptureIntention('execution-1', organizationId)
            expect(result.state).toBe('canceled')
        })

        it('no-ops when a settlement intention already exists, regardless of decision', async () => {
            manager.findOneOrFail.mockImplementation((entityClass: unknown) =>
                entityClass === VerificationExecutionEntity ? Promise.resolve(execution({ state: 'settling' })) : Promise.resolve(null),
            )
            manager.findOneBy.mockResolvedValue({ executionId: 'execution-1', decision: 'capture' })
            const result = await store.cancelIfNoCaptureIntention('execution-1', organizationId)
            expect(result.state).toBe('settling')
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('is a no-op replay when already terminal', async () => {
            manager.findOneOrFail.mockResolvedValue(execution({ state: 'completed' }))
            const result = await store.cancelIfNoCaptureIntention('execution-1', organizationId)
            expect(result.state).toBe('completed')
            expect(manager.findOneBy).not.toHaveBeenCalled()
        })
    })

    describe('lease lifecycle', () => {
        it('acquires a lease only from queued or awaiting_retry', async () => {
            manager.findOne.mockResolvedValue(execution({ state: 'queued' }))
            const leased = await store.acquireLease('execution-1', organizationId, 'worker-1', new Date(), new Date())
            expect(leased?.state).toBe('running')
        })

        it('refuses to acquire a lease on a running execution', async () => {
            manager.findOne.mockResolvedValue(execution({ state: 'running' }))
            await expect(
                store.acquireLease('execution-1', organizationId, 'worker-1', new Date(), new Date()),
            ).resolves.toBeNull()
        })

        it('acquires a lease from awaiting_retry once its retryAt has passed', async () => {
            const now = new Date('2026-09-14T00:01:00.000Z')
            const retryAt = new Date('2026-09-14T00:00:00.000Z')
            manager.findOne.mockResolvedValue(execution({ state: 'awaiting_retry', retryAt }))
            const leased = await store.acquireLease('execution-1', organizationId, 'worker-1', new Date(), now)
            expect(leased?.state).toBe('running')
        })

        it('refuses to shorten a scheduled retry backoff for a caller racing the clock', async () => {
            const now = new Date('2026-09-14T00:00:30.000Z')
            const retryAt = new Date('2026-09-14T00:01:00.000Z')
            manager.findOne.mockResolvedValue(execution({ state: 'awaiting_retry', retryAt }))
            await expect(
                store.acquireLease('execution-1', organizationId, 'worker-1', new Date(), now),
            ).resolves.toBeNull()
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('renews only with a matching generation and lease owner', async () => {
            manager.findOne.mockResolvedValue(
                execution({ state: 'running', attemptGeneration: 1, leaseOwnerId: 'worker-1' }),
            )
            await expect(
                store.renewLease('execution-1', organizationId, 'worker-1', 1, new Date()),
            ).resolves.not.toBeNull()
            await expect(
                store.renewLease('execution-1', organizationId, 'worker-1', 2, new Date()),
            ).resolves.toBeNull()
        })

        it('takes over for retry, bumping the generation and clearing the lease', async () => {
            manager.findOne.mockResolvedValue(
                execution({ state: 'running', attemptGeneration: 0, leaseOwnerId: 'worker-1' }),
            )
            const retryAt = new Date()
            const result = await store.takeoverForRetry('execution-1', organizationId, 0, retryAt)
            expect(result).toEqual(
                expect.objectContaining({ attemptGeneration: 1, leaseOwnerId: null, state: 'awaiting_retry', retryAt }),
            )
        })

        it('redispatches immediately (queued) when no retry delay is given', async () => {
            manager.findOne.mockResolvedValue(execution({ state: 'running', attemptGeneration: 0 }))
            const result = await store.takeoverForRetry('execution-1', organizationId, 0, null)
            expect(result?.state).toBe('queued')
        })

        it('rejects takeover on a stale expected generation', async () => {
            manager.findOne.mockResolvedValue(execution({ attemptGeneration: 5 }))
            await expect(store.takeoverForRetry('execution-1', organizationId, 4, null)).resolves.toBeNull()
        })
    })

    it('pages nonterminal executions regardless of funding owner', async () => {
        manager.find.mockResolvedValue([execution({ fundingOwnerType: 'batch_group', fundingOwnerId: 'batch-1' })])
        const page = await store.pageNonterminal(100)
        expect(page).toHaveLength(1)
        const [, options] = manager.find.mock.calls[0] as [unknown, { where: Record<string, unknown> }]
        expect(options.where).not.toHaveProperty('fundingOwnerType')
    })

    describe('cancelBatchGroupUnstarted', () => {
        it('cancels every unstarted batch-owned row and returns it', async () => {
            const rows = [
                execution({ executionId: 'execution-1', state: 'queued', fundingOwnerType: 'batch_group', fundingOwnerId: 'batch-1' }),
                execution({ executionId: 'execution-2', state: 'funding_pending', fundingOwnerType: 'batch_group', fundingOwnerId: 'batch-1' }),
            ]
            manager.find.mockResolvedValue(rows)

            const result = await store.cancelBatchGroupUnstarted('batch-1', organizationId)

            expect(manager.find).toHaveBeenCalledWith(
                VerificationExecutionEntity,
                expect.objectContaining({
                    where: expect.objectContaining({ fundingOwnerType: 'batch_group', fundingOwnerId: 'batch-1' }),
                    lock: { mode: 'pessimistic_write' },
                }),
            )
            expect(manager.save).toHaveBeenCalledWith(VerificationExecutionEntity, rows)
            expect(result.every(row => row.state === 'canceled')).toBe(true)
            expect(result).toHaveLength(2)
        })

        it('skips saving when no unstarted batch-owned row exists', async () => {
            manager.find.mockResolvedValue([])
            const result = await store.cancelBatchGroupUnstarted('batch-1', organizationId)
            expect(result).toEqual([])
            expect(manager.save).not.toHaveBeenCalled()
        })
    })

    it('pages canceled executions still holding a pending linked request', async () => {
        const subQuery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('SELECT 1'),
        }
        const queryBuilder: {
            where: jest.Mock
            andWhere: jest.Mock
            subQuery: jest.Mock
            orderBy: jest.Mock
            take: jest.Mock
            getMany: jest.Mock
        } = {
            where: jest.fn(),
            andWhere: jest.fn(),
            subQuery: jest.fn().mockReturnValue(subQuery),
            orderBy: jest.fn(),
            take: jest.fn(),
            getMany: jest.fn().mockResolvedValue([execution({ state: 'canceled' })]),
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockImplementation((arg: unknown) => {
            if (typeof arg === 'function') arg(queryBuilder)
            return queryBuilder
        })
        queryBuilder.orderBy.mockReturnValue(queryBuilder)
        queryBuilder.take.mockReturnValue(queryBuilder)
        manager.createQueryBuilder.mockReturnValue(queryBuilder)

        const page = await store.pageCanceledPendingCleanup(50)

        expect(page).toHaveLength(1)
        expect(queryBuilder.where).toHaveBeenCalledWith('execution.state = :state', { state: 'canceled' })
        expect(queryBuilder.take).toHaveBeenCalledWith(50)
        expect(subQuery.getQuery).toHaveBeenCalled()
    })
})
