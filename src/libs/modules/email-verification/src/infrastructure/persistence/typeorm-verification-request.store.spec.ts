import { DataSource, EntityManager } from 'typeorm'
import { NewVerificationRequestInput } from '../../application/ports/verification-request-store'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { TypeOrmVerificationRequestStore } from './typeorm-verification-request.store'

const organizationId = '10000000-0000-4000-8000-000000000001'

function input(overrides: Partial<NewVerificationRequestInput> = {}): NewVerificationRequestInput {
    return {
        requestId: '20000000-0000-4000-8000-000000000001',
        organizationId,
        normalizedAddress: 'person@example.test',
        deliveryMode: 'sync',
        clientRequestKey: null,
        source: 'fresh',
        executionId: null,
        resultId: null,
        reservedCount: 1,
        billingState: 'pending',
        finalReason: null,
        ...overrides,
    }
}

function entity(overrides: Partial<VerificationRequestEntity> = {}): VerificationRequestEntity {
    return {
        requestId: input().requestId,
        organizationId,
        normalizedAddress: 'person@example.test',
        deliveryMode: 'sync',
        clientRequestKey: null,
        executionId: null,
        resultId: null,
        source: 'fresh',
        billingState: 'pending',
        reservedCount: 0,
        chargedCount: 0,
        finalReason: null,
        createdAt: new Date(),
        settledAt: null,
        ...overrides,
    } as VerificationRequestEntity
}

describe('TypeOrmVerificationRequestStore', () => {
    let manager: {
        findOne: jest.Mock
        findOneBy: jest.Mock
        find: jest.Mock
        save: jest.Mock
        create: jest.Mock
        update: jest.Mock
    }
    let store: TypeOrmVerificationRequestStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((_entityClass: unknown, value: unknown) => value),
            save: jest.fn((_entityClass: unknown, value: unknown) => Promise.resolve(entity(value as object))),
            update: jest.fn(),
        }
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmVerificationRequestStore({
            transaction,
            manager: manager as unknown as EntityManager,
        } as unknown as DataSource)
    })

    it('inserts a new request without a client key', async () => {
        manager.findOne.mockResolvedValue(null)
        const outcome = await store.insert(input())
        expect(outcome).toEqual({ kind: 'inserted', record: expect.objectContaining({ requestId: input().requestId }) })
        expect(manager.findOne).not.toHaveBeenCalled()
    })

    it('locks and inserts under a supplied client key', async () => {
        manager.findOne.mockResolvedValue(null)
        const outcome = await store.insert(input({ clientRequestKey: 'key-1' }))
        expect(outcome.kind).toBe('inserted')
        expect(manager.findOne).toHaveBeenCalledWith(
            VerificationRequestEntity,
            expect.objectContaining({ where: { organizationId, clientRequestKey: 'key-1' } }),
        )
    })

    it('replays an existing request with a matching address and delivery mode', async () => {
        manager.findOne.mockResolvedValue(entity({ clientRequestKey: 'key-1' }))
        const outcome = await store.insert(input({ clientRequestKey: 'key-1' }))
        expect(outcome.kind).toBe('replayed')
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('conflicts a repeated key with a different address', async () => {
        manager.findOne.mockResolvedValue(entity({ clientRequestKey: 'key-1', normalizedAddress: 'other@example.test' }))
        const outcome = await store.insert(input({ clientRequestKey: 'key-1' }))
        expect(outcome).toEqual({ kind: 'key-conflict' })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it('conflicts a repeated key with a different delivery mode', async () => {
        manager.findOne.mockResolvedValue(entity({ clientRequestKey: 'key-1', deliveryMode: 'async' }))
        const outcome = await store.insert(input({ clientRequestKey: 'key-1', deliveryMode: 'sync' }))
        expect(outcome).toEqual({ kind: 'key-conflict' })
    })

    it('marks a cache-sourced insert settled with its result immediately', async () => {
        manager.findOne.mockResolvedValue(null)
        await store.insert(input({ source: 'cache', resultId: 'result-1', billingState: 'settled', finalReason: 'cached' }))
        expect(manager.create).toHaveBeenCalledWith(
            VerificationRequestEntity,
            expect.objectContaining({ billingState: 'settled', finalReason: 'cached', resultId: 'result-1' }),
        )
    })

    it('attaches an execution to an existing request', async () => {
        await store.attachExecution('request-1', organizationId, 'execution-1')
        expect(manager.update).toHaveBeenCalledWith(
            VerificationRequestEntity,
            { requestId: 'request-1', organizationId },
            { executionId: 'execution-1' },
        )
    })

    it('finds a request by its client key through the plain manager', async () => {
        manager.findOneBy.mockResolvedValue(entity({ clientRequestKey: 'key-1' }))
        const record = await store.findByClientKey(organizationId, 'key-1')
        expect(record?.clientRequestKey).toBe('key-1')
    })

    it('finds a request by its ID through the plain manager', async () => {
        manager.findOneBy.mockResolvedValue(entity())
        const record = await store.findById(input().requestId, organizationId)
        expect(record?.requestId).toBe(input().requestId)
    })

    it('returns null when a request is not found', async () => {
        manager.findOneBy.mockResolvedValue(null)
        await expect(store.findById('unknown', organizationId)).resolves.toBeNull()
        await expect(store.findByClientKey(organizationId, 'unknown')).resolves.toBeNull()
    })

    describe('settleCanceled', () => {
        it('settles every unsettled linked request as a zero-charge failure with no result', async () => {
            manager.find.mockResolvedValue([
                entity({ requestId: 'request-1', executionId: 'execution-1', billingState: 'pending' }),
                entity({ requestId: 'request-2', executionId: 'execution-1', billingState: 'pending' }),
            ])

            await store.settleCanceled('execution-1', organizationId)

            expect(manager.find).toHaveBeenCalledWith(
                VerificationRequestEntity,
                expect.objectContaining({ where: { executionId: 'execution-1', organizationId } }),
            )
            expect(manager.save).toHaveBeenCalledWith(
                VerificationRequestEntity,
                [
                    expect.objectContaining({ requestId: 'request-1', billingState: 'settled', finalReason: 'failed', chargedCount: 0, resultId: null }),
                    expect.objectContaining({ requestId: 'request-2', billingState: 'settled', finalReason: 'failed', chargedCount: 0, resultId: null }),
                ],
            )
        })

        it('is a no-op when no linked requests exist', async () => {
            manager.find.mockResolvedValue([])
            await store.settleCanceled('execution-1', organizationId)
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('skips a request that is already settled, replaying idempotently', async () => {
            manager.find.mockResolvedValue([
                entity({ requestId: 'request-1', executionId: 'execution-1', billingState: 'settled', finalReason: 'conclusive' }),
            ])

            await store.settleCanceled('execution-1', organizationId)

            expect(manager.save).not.toHaveBeenCalled()
        })
    })
})
