import { DataSource, EntityManager } from 'typeorm'
import { NewVerificationRequestInput } from '../../application/ports/verification-request-store'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
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
        createQueryBuilder: jest.Mock
    }
    let queryBuilder: {
        insert: jest.Mock
        into: jest.Mock
        values: jest.Mock
        onConflict: jest.Mock
        returning: jest.Mock
        execute: jest.Mock
    }
    let store: TypeOrmVerificationRequestStore

    beforeEach(() => {
        queryBuilder = {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            onConflict: jest.fn().mockReturnThis(),
            returning: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ raw: [{ requestId: input().requestId }] }),
        }
        manager = {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((_entityClass: unknown, value: unknown) => value),
            save: jest.fn((_entityClass: unknown, value: unknown) => Promise.resolve(entity(value as object))),
            update: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
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
        manager.findOneBy.mockResolvedValue(entity(input()))
        const outcome = await store.insert(input())
        expect(outcome).toEqual({ kind: 'inserted', record: expect.objectContaining({ requestId: input().requestId }) })
        expect(manager.findOne).not.toHaveBeenCalled()
    })

    it('locks and inserts under a supplied client key', async () => {
        manager.findOne.mockResolvedValue(null)
        manager.findOneBy.mockResolvedValue(entity(input({ clientRequestKey: 'key-1' })))
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
        manager.findOne.mockResolvedValue(
            entity({ clientRequestKey: 'key-1', normalizedAddress: 'other@example.test' }),
        )
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
        const cacheInput = input({
            source: 'cache',
            resultId: 'result-1',
            billingState: 'settled',
            finalReason: 'cached',
        })
        manager.findOneBy.mockResolvedValue(entity(cacheInput))
        await store.insert(cacheInput)
        expect(manager.create).toHaveBeenCalledWith(
            VerificationRequestEntity,
            expect.objectContaining({ billingState: 'settled', finalReason: 'cached', resultId: 'result-1' }),
        )
    })

    describe('unkeyed batch receipt insertion', () => {
        const batchInput = input({ deliveryMode: 'batch', executionId: 'execution-1' })

        it('inserts the assigned UUID without allowing an existing receipt to be overwritten', async () => {
            manager.findOneBy.mockResolvedValue(entity(batchInput))

            const outcome = await store.insert(batchInput)

            expect(outcome).toEqual({
                kind: 'inserted',
                record: expect.objectContaining(batchInput),
            })
            expect(queryBuilder.into).toHaveBeenCalledWith(VerificationRequestEntity)
            expect(queryBuilder.values).toHaveBeenCalledWith(expect.objectContaining(batchInput))
            expect(queryBuilder.onConflict).toHaveBeenCalledWith('("requestId") DO NOTHING')
            expect(queryBuilder.returning).toHaveBeenCalledWith(['requestId'])
            expect(manager.findOneBy).toHaveBeenCalledWith(VerificationRequestEntity, {
                requestId: batchInput.requestId,
                organizationId,
            })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('replays a settled payer without changing its result, financial counts, or timestamps', async () => {
            const settled = entity({
                ...batchInput,
                billingState: 'settled',
                reservedCount: 1,
                chargedCount: 1,
                finalReason: 'conclusive',
                resultId: 'result-1',
                createdAt: new Date('2026-09-17T10:00:00Z'),
                settledAt: new Date('2026-09-17T10:01:00Z'),
            })
            queryBuilder.execute.mockResolvedValue({ raw: [] })
            manager.findOneBy.mockResolvedValue(settled)

            await expect(store.insert(batchInput)).resolves.toEqual({ kind: 'replayed', record: settled })
            expect(manager.save).not.toHaveBeenCalled()
            expect(manager.update).not.toHaveBeenCalled()
        })

        it('inherits a completed execution when a fresh batch payer materializes after settlement', async () => {
            manager.findOne.mockResolvedValue({
                executionId: batchInput.executionId,
                state: 'completed',
                payerRequestId: batchInput.requestId,
                resultId: 'result-1',
            })
            manager.findOneBy.mockImplementation((type: unknown) =>
                type === VerificationSettlementIntentionEntity
                    ? Promise.resolve({ state: 'confirmed', decision: 'capture' })
                    : Promise.resolve(
                          entity({
                              ...batchInput,
                              billingState: 'settled',
                              resultId: 'result-1',
                              finalReason: 'conclusive',
                              chargedCount: 1,
                          }),
                      ),
            )

            const outcome = await store.insert(batchInput)

            expect(outcome).toEqual({
                kind: 'inserted',
                record: expect.objectContaining({
                    billingState: 'settled',
                    chargedCount: 1,
                    finalReason: 'conclusive',
                    resultId: 'result-1',
                }),
            })
            expect(manager.findOne).toHaveBeenCalledWith(
                VerificationExecutionEntity,
                expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
            )
            expect(queryBuilder.values).toHaveBeenCalledWith(
                expect.objectContaining({ billingState: 'settled', chargedCount: 1, resultId: 'result-1' }),
            )
        })

        it.each(['sync', 'async', 'batch_child'] as const)(
            'rejects a replay that changes a batch receipt to %s delivery',
            async deliveryMode => {
                const settled = entity({ ...batchInput, billingState: 'settled', chargedCount: 1 })
                queryBuilder.execute.mockResolvedValue({ raw: [] })
                manager.findOneBy.mockResolvedValue(settled)

                await expect(store.insert({ ...batchInput, deliveryMode })).rejects.toThrow(
                    'batch_request_identity_conflict',
                )
                expect(manager.save).not.toHaveBeenCalled()
                expect(manager.update).not.toHaveBeenCalled()
                expect(settled.deliveryMode).toBe('batch')
                expect(settled.chargedCount).toBe(1)
            },
        )

        it('rejects a new client key attached to an existing keyless batch UUID', async () => {
            manager.findOne.mockResolvedValue(null)
            const settled = entity({ ...batchInput, billingState: 'settled', chargedCount: 1 })
            queryBuilder.execute.mockResolvedValue({ raw: [] })
            manager.findOneBy.mockResolvedValue(settled)

            await expect(store.insert({ ...batchInput, clientRequestKey: 'new-key' })).rejects.toThrow(
                'batch_request_identity_conflict',
            )
            expect(manager.save).not.toHaveBeenCalled()
            expect(manager.update).not.toHaveBeenCalled()
            expect(settled.clientRequestKey).toBeNull()
            expect(settled.chargedCount).toBe(1)
        })

        it.each([
            ['request UUID', { requestId: 'other-request' }],
            ['organization', { organizationId: 'other-organization' }],
            ['address', { normalizedAddress: 'other@example.test' }],
            ['delivery mode', { deliveryMode: 'async' }],
            ['source', { source: 'shared' }],
            ['execution', { executionId: 'other-execution' }],
            ['client key', { clientRequestKey: 'other-key' }],
        ] satisfies [string, Partial<VerificationRequestEntity>][])(
            'rejects a conflicting %s without mutation',
            async (_field, conflict) => {
                queryBuilder.execute.mockResolvedValue({ raw: [] })
                manager.findOneBy.mockResolvedValue(entity({ ...batchInput, ...conflict }))

                await expect(store.insert(batchInput)).rejects.toThrow('batch_request_identity_conflict')
                expect(manager.save).not.toHaveBeenCalled()
                expect(manager.update).not.toHaveBeenCalled()
            },
        )

        it('conceals a UUID conflict belonging to another organization when the scoped read finds no winner', async () => {
            queryBuilder.execute.mockResolvedValue({ raw: [] })
            manager.findOneBy.mockResolvedValue(null)

            await expect(store.insert(batchInput)).rejects.toThrow('batch_request_identity_conflict')
            expect(manager.findOneBy).toHaveBeenCalledWith(VerificationRequestEntity, {
                requestId: batchInput.requestId,
                organizationId,
            })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it.each(['cache', 'cooldown'] as const)(
            'preserves the recorded %s result association on replay',
            async source => {
                const freeInput = input({
                    deliveryMode: 'batch',
                    source,
                    executionId: null,
                    resultId: 'original-result',
                    reservedCount: 0,
                    billingState: 'settled',
                    finalReason: source === 'cache' ? 'cached' : 'inconclusive',
                })
                const freeReceipt = entity({ ...freeInput, settledAt: new Date('2026-09-17T10:01:00Z') })
                queryBuilder.execute.mockResolvedValue({ raw: [] })
                manager.findOneBy.mockResolvedValue(freeReceipt)

                await expect(store.insert(freeInput)).resolves.toEqual({ kind: 'replayed', record: freeReceipt })
                await expect(store.insert({ ...freeInput, resultId: 'newer-result' })).rejects.toThrow(
                    'batch_request_identity_conflict',
                )
                expect(manager.save).not.toHaveBeenCalled()
                expect(manager.update).not.toHaveBeenCalled()
            },
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
            expect(manager.save).toHaveBeenCalledWith(VerificationRequestEntity, [
                expect.objectContaining({
                    requestId: 'request-1',
                    billingState: 'settled',
                    finalReason: 'failed',
                    chargedCount: 0,
                    resultId: null,
                }),
                expect.objectContaining({
                    requestId: 'request-2',
                    billingState: 'settled',
                    finalReason: 'failed',
                    chargedCount: 0,
                    resultId: null,
                }),
            ])
        })

        it('is a no-op when no linked requests exist', async () => {
            manager.find.mockResolvedValue([])
            await store.settleCanceled('execution-1', organizationId)
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('skips a request that is already settled, replaying idempotently', async () => {
            manager.find.mockResolvedValue([
                entity({
                    requestId: 'request-1',
                    executionId: 'execution-1',
                    billingState: 'settled',
                    finalReason: 'conclusive',
                }),
            ])

            await store.settleCanceled('execution-1', organizationId)

            expect(manager.save).not.toHaveBeenCalled()
        })
    })
})
