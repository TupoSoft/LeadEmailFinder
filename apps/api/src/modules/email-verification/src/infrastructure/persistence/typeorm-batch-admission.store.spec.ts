import { DataSource, EntityManager, IsNull } from 'typeorm'
import { BatchAdmissionEntity } from './typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from './typeorm/batch-unique-address.entity'
import { TypeOrmBatchAdmissionStore } from './typeorm-batch-admission.store'

const organizationId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'

function admissionEntity(overrides: Partial<BatchAdmissionEntity> = {}): BatchAdmissionEntity {
    return {
        batchId,
        organizationId,
        state: 'validating',
        totalRows: 10,
        uniqueAddressCount: 8,
        clientRequestKey: null,
        contentDigest: null,
        fundingDecision: 'pending',
        finalizationState: 'preparing',
        admissionLeaseOwnerId: null,
        admissionLeaseExpiresAt: null,
        admissionGeneration: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('TypeOrmBatchAdmissionStore', () => {
    let manager: {
        findOne: jest.Mock
        findOneBy: jest.Mock
        create: jest.Mock
        save: jest.Mock
        update: jest.Mock
        find: jest.Mock
        count: jest.Mock
        createQueryBuilder: jest.Mock
    }
    let queryBuilder: { insert: jest.Mock; into: jest.Mock; values: jest.Mock; orIgnore: jest.Mock; execute: jest.Mock }
    let selectQueryBuilder: {
        where: jest.Mock
        andWhere: jest.Mock
        subQuery: jest.Mock
        getCount: jest.Mock
        leftJoin: jest.Mock
        select: jest.Mock
        addSelect: jest.Mock
        getRawOne: jest.Mock
    }
    let store: TypeOrmBatchAdmissionStore

    beforeEach(() => {
        manager = {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            create: jest.fn((_entity: unknown, value: unknown) => value),
            save: jest.fn((_entity: unknown, value: unknown) => Promise.resolve(value)),
            update: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            createQueryBuilder: jest.fn(),
        }
        const subQuery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('SELECT 1'),
        }
        selectQueryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            subQuery: jest.fn().mockReturnValue(subQuery),
            getCount: jest.fn().mockResolvedValue(0),
            leftJoin: jest.fn(),
            select: jest.fn(),
            addSelect: jest.fn(),
            getRawOne: jest.fn().mockResolvedValue(null),
        }
        selectQueryBuilder.where.mockReturnValue(selectQueryBuilder)
        selectQueryBuilder.andWhere.mockImplementation((arg: string | ((builder: typeof selectQueryBuilder) => string)) => {
            if (typeof arg === 'function') arg(selectQueryBuilder)
            return selectQueryBuilder
        })
        selectQueryBuilder.leftJoin.mockReturnValue(selectQueryBuilder)
        selectQueryBuilder.select.mockReturnValue(selectQueryBuilder)
        selectQueryBuilder.addSelect.mockReturnValue(selectQueryBuilder)
        manager.createQueryBuilder.mockReturnValue(selectQueryBuilder)
        queryBuilder = {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
        }
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmBatchAdmissionStore({
            transaction,
            manager: manager as unknown as EntityManager,
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        } as unknown as DataSource)
    })

    describe('createOrReplay', () => {
        const input = {
            batchId,
            organizationId,
            totalRows: 10,
            uniqueAddressCount: 8,
            clientRequestKey: 'key-1',
            contentDigest: 'digest-1',
        }

        it('creates a new admission when no client key is repeated', async () => {
            manager.findOneBy.mockResolvedValue(null)
            const outcome = await store.createOrReplay(input)
            expect(outcome).toEqual({ kind: 'created', record: expect.objectContaining({ batchId }) })
            expect(manager.save).toHaveBeenCalled()
        })

        it('replays the existing admission for a repeated key with a matching digest', async () => {
            manager.findOneBy
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(admissionEntity({ clientRequestKey: 'key-1', contentDigest: 'digest-1' }))
            const outcome = await store.createOrReplay(input)
            expect(outcome).toEqual({ kind: 'replayed', record: expect.objectContaining({ batchId }) })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('replays the same admission for a retried job attempt sharing the same batch id', async () => {
            manager.findOneBy.mockResolvedValueOnce(admissionEntity())
            const outcome = await store.createOrReplay(input)
            expect(outcome).toEqual({ kind: 'replayed', record: expect.objectContaining({ batchId }) })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('reports a key conflict for a repeated key with a different digest', async () => {
            manager.findOneBy
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(admissionEntity({ clientRequestKey: 'key-1', contentDigest: 'other-digest' }))
            await expect(store.createOrReplay(input)).resolves.toEqual({ kind: 'key-conflict' })
            expect(manager.save).not.toHaveBeenCalled()
        })
    })

    it('finds an admission by id', async () => {
        manager.findOneBy.mockResolvedValue(admissionEntity())
        await expect(store.findById(batchId, organizationId)).resolves.toEqual(expect.objectContaining({ batchId }))
        expect(manager.findOneBy).toHaveBeenCalledWith(BatchAdmissionEntity, { batchId, organizationId })
    })

    it('skips the insert entirely for an empty address list', async () => {
        await store.insertUniqueAddresses(batchId, organizationId, [])
        expect(queryBuilder.execute).not.toHaveBeenCalled()
    })

    it('inserts unique addresses ignoring conflicts', async () => {
        await store.insertUniqueAddresses(batchId, organizationId, [{ normalizedAddress: 'a@example.test', firstSeenRow: 1 }])
        expect(queryBuilder.into).toHaveBeenCalledWith(BatchUniqueAddressEntity)
        expect(queryBuilder.orIgnore).toHaveBeenCalled()
        expect(queryBuilder.execute).toHaveBeenCalled()
    })

    it('pages unique addresses ordered by first-seen row', async () => {
        await store.pageUniqueAddresses(batchId, organizationId, 10, 50)
        expect(manager.find).toHaveBeenCalledWith(BatchUniqueAddressEntity, {
            where: { batchId, organizationId },
            order: { firstSeenRow: 'ASC' },
            skip: 10,
            take: 50,
        })
    })

    describe('admission fencing', () => {
        const now = new Date('2026-09-15T00:00:00.000Z')
        const fence = { ownerId: 'owner-1', generation: 3, now }
        const leased = (overrides: Partial<BatchAdmissionEntity> = {}): BatchAdmissionEntity =>
            admissionEntity({
                state: 'admitting',
                admissionLeaseOwnerId: 'owner-1',
                admissionLeaseExpiresAt: new Date(now.getTime() + 1),
                admissionGeneration: 3,
                ...overrides,
            })
        const outcome = { admissionKind: 'created' as const, executionId: 'execution-1', resultId: null }

        it('records an outcome only for a not-yet-recorded address under a shared group lock', async () => {
            manager.findOne.mockResolvedValue(leased())

            await expect(store.recordAdmissionOutcome(batchId, organizationId, fence, 'a@example.test', outcome)).resolves.toBe('applied')

            expect(manager.findOne).toHaveBeenCalledWith(BatchAdmissionEntity, {
                where: { batchId, organizationId },
                lock: { mode: 'pessimistic_read' },
            })
            expect(manager.update).toHaveBeenCalledWith(
                BatchUniqueAddressEntity,
                { batchId, organizationId, normalizedAddress: 'a@example.test', admissionKind: IsNull() },
                outcome,
            )
        })

        it.each([
            ['an expired lease', { admissionLeaseExpiresAt: now }],
            ['a newer generation', { admissionGeneration: 4 }],
            ['a released lease', { admissionLeaseOwnerId: null, admissionLeaseExpiresAt: null }],
            ['a frozen manifest', { state: 'funding' as const }],
        ])('rejects an outcome write from %s without touching the manifest', async (_case, overrides) => {
            manager.findOne.mockResolvedValue(leased(overrides))

            await expect(store.recordAdmissionOutcome(batchId, organizationId, fence, 'a@example.test', outcome)).resolves.toBe('stale')

            expect(manager.update).not.toHaveBeenCalled()
        })

        it('reports a live foreign lease as busy without taking it', async () => {
            const leaseExpiresAt = new Date(now.getTime() + 30_000)
            manager.findOne.mockResolvedValue(leased({ admissionLeaseOwnerId: 'other-owner', admissionLeaseExpiresAt: leaseExpiresAt }))

            await expect(
                store.claimAdmissionLease(batchId, organizationId, 'owner-2', now, new Date(now.getTime() + 60_000)),
            ).resolves.toEqual({ kind: 'busy', leaseExpiresAt })
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('takes over an expired lease with the next generation', async () => {
            manager.findOne.mockResolvedValue(leased({ admissionLeaseOwnerId: 'crashed-owner', admissionLeaseExpiresAt: now }))
            const leaseExpiresAt = new Date(now.getTime() + 60_000)

            const claimed = await store.claimAdmissionLease(batchId, organizationId, 'owner-2', now, leaseExpiresAt)

            expect(claimed).toMatchObject({ kind: 'acquired', generation: 4 })
            expect(manager.save).toHaveBeenCalledWith(
                BatchAdmissionEntity,
                expect.objectContaining({ admissionLeaseOwnerId: 'owner-2', admissionLeaseExpiresAt: leaseExpiresAt, admissionGeneration: 4 }),
            )
        })

        it('transitions state only from the expected state under the current generation', async () => {
            manager.findOne.mockResolvedValue(leased({ state: 'validating' }))
            await expect(store.transitionState(batchId, organizationId, fence, 'admitting', 'funding')).resolves.toBe('stale')

            manager.findOne.mockResolvedValue(leased({ state: 'validating' }))
            await expect(store.transitionState(batchId, organizationId, fence, 'validating', 'admitting')).resolves.toBe('applied')
            expect(manager.save).toHaveBeenCalledWith(BatchAdmissionEntity, expect.objectContaining({ state: 'admitting' }))
        })
    })

    describe('ensurePayerRequestId', () => {
        const identity = { batchId, organizationId, normalizedAddress: 'a@example.test' }

        it('assigns an identity only to an unassigned address in the owning organization', async () => {
            manager.findOneBy.mockResolvedValue({ ...identity, payerRequestId: 'request-1' })

            await expect(
                store.ensurePayerRequestId(batchId, organizationId, identity.normalizedAddress, 'request-1'),
            ).resolves.toBe('request-1')

            expect(manager.update).toHaveBeenCalledWith(
                BatchUniqueAddressEntity,
                { ...identity, payerRequestId: IsNull() },
                { payerRequestId: 'request-1' },
            )
            expect(manager.findOneBy).toHaveBeenCalledWith(BatchUniqueAddressEntity, identity)
        })

        it('returns the committed winner instead of the candidate when the identity is already assigned', async () => {
            manager.update.mockResolvedValue({ affected: 0 })
            manager.findOneBy.mockResolvedValue({ ...identity, payerRequestId: 'winning-request' })

            await expect(
                store.ensurePayerRequestId(batchId, organizationId, identity.normalizedAddress, 'losing-request'),
            ).resolves.toBe('winning-request')
            expect(manager.update).toHaveBeenCalledTimes(1)
            expect(manager.update).toHaveBeenCalledWith(
                BatchUniqueAddressEntity,
                { ...identity, payerRequestId: IsNull() },
                { payerRequestId: 'losing-request' },
            )
        })

        it.each([organizationId, 'foreign-organization'])('rejects missing or foreign rows for %s', async requestedOrg => {
            manager.update.mockResolvedValue({ affected: 0 })
            manager.findOneBy.mockResolvedValue(null)

            await expect(
                store.ensurePayerRequestId(batchId, requestedOrg, identity.normalizedAddress, 'request-1'),
            ).rejects.toThrow('batch_payer_identity_missing')
            expect(manager.update).toHaveBeenCalledWith(
                BatchUniqueAddressEntity,
                { ...identity, organizationId: requestedOrg, payerRequestId: IsNull() },
                { payerRequestId: 'request-1' },
            )
            expect(manager.findOneBy).toHaveBeenCalledWith(BatchUniqueAddressEntity, {
                ...identity,
                organizationId: requestedOrg,
            })
        })
    })

    describe('countUnsettledAddresses', () => {
        it('sums addresses with no payer request yet and addresses whose payer request is not yet settled', async () => {
            manager.count.mockResolvedValue(2)
            selectQueryBuilder.getCount.mockResolvedValue(3)

            await expect(store.countUnsettledAddresses(batchId, organizationId)).resolves.toBe(5)

            expect(manager.count).toHaveBeenCalledWith(BatchUniqueAddressEntity, {
                where: { batchId, organizationId, payerRequestId: IsNull() },
            })
            expect(selectQueryBuilder.andWhere).toHaveBeenCalledWith('address.payerRequestId IS NOT NULL')
        })

        it('reports zero once every address has a settled payer request', async () => {
            manager.count.mockResolvedValue(0)
            selectQueryBuilder.getCount.mockResolvedValue(0)
            await expect(store.countUnsettledAddresses(batchId, organizationId)).resolves.toBe(0)
        })
    })

    describe('getStatusCounts', () => {
        it('parses the aggregate raw counts, defaulting missing fields to zero', async () => {
            selectQueryBuilder.getRawOne.mockResolvedValue({
                cachedAddresses: '2',
                sharedAddresses: '1',
                cooldownAddresses: '0',
                completedAddresses: '5',
                conclusiveAddresses: '3',
                inconclusiveAddresses: null,
                failedAddresses: '1',
                reserved: '4',
                charged: '3',
            })

            await expect(store.getStatusCounts(batchId, organizationId)).resolves.toEqual({
                cachedAddresses: 2,
                sharedAddresses: 1,
                cooldownAddresses: 0,
                completedAddresses: 5,
                conclusiveAddresses: 3,
                inconclusiveAddresses: 0,
                failedAddresses: 1,
                reserved: 4,
                charged: 3,
            })
            expect(selectQueryBuilder.where).toHaveBeenCalledWith('address.batchId = :batchId', { batchId })
            expect(selectQueryBuilder.andWhere).toHaveBeenCalledWith('address.organizationId = :organizationId', {
                organizationId,
            })
        })

        it('reports all zeros for a batch with no addresses at all', async () => {
            selectQueryBuilder.getRawOne.mockResolvedValue(null)
            await expect(store.getStatusCounts(batchId, organizationId)).resolves.toEqual({
                cachedAddresses: 0,
                sharedAddresses: 0,
                cooldownAddresses: 0,
                completedAddresses: 0,
                conclusiveAddresses: 0,
                inconclusiveAddresses: 0,
                failedAddresses: 0,
                reserved: 0,
                charged: 0,
            })
        })
    })
})
