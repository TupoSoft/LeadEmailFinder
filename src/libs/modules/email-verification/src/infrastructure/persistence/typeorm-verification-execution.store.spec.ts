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
        }
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
            const leased = await store.acquireLease('execution-1', organizationId, 'worker-1', new Date())
            expect(leased?.state).toBe('running')
        })

        it('refuses to acquire a lease on a running execution', async () => {
            manager.findOne.mockResolvedValue(execution({ state: 'running' }))
            await expect(store.acquireLease('execution-1', organizationId, 'worker-1', new Date())).resolves.toBeNull()
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

    it('pages only single-owned nonterminal executions', async () => {
        manager.find.mockResolvedValue([execution()])
        const page = await store.pageNonterminal(100)
        expect(page).toHaveLength(1)
        expect(manager.find).toHaveBeenCalledWith(
            VerificationExecutionEntity,
            expect.objectContaining({ where: expect.objectContaining({ fundingOwnerType: 'single' }) }),
        )
    })
})
