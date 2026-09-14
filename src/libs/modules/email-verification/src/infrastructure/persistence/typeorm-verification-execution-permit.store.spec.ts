import { DataSource, EntityManager } from 'typeorm'
import { VerificationExecutionPermitLockEntity } from './typeorm/verification-execution-permit-lock.entity'
import { VerificationExecutionPermitEntity } from './typeorm/verification-execution-permit.entity'
import { TypeOrmVerificationExecutionPermitStore } from './typeorm-verification-execution-permit.store'

const organizationId = '10000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-13T00:00:00.000Z')
const expiresAt = new Date(now.getTime() + 60_000)

describe('TypeOrmVerificationExecutionPermitStore', () => {
    let manager: {
        findOneOrFail: jest.Mock
        create: jest.Mock
        save: jest.Mock
        delete: jest.Mock
        count: jest.Mock
        update: jest.Mock
        insert: jest.Mock
        transaction: jest.Mock
    }
    let store: TypeOrmVerificationExecutionPermitStore

    beforeEach(() => {
        manager = {
            findOneOrFail: jest.fn().mockResolvedValue({ id: 'global' }),
            create: jest.fn((_entityClass: unknown, value: unknown) => value),
            save: jest.fn((_entityClass: unknown, value: unknown) => Promise.resolve(value)),
            delete: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            insert: jest.fn().mockResolvedValue({}),
            transaction: jest.fn(),
        }
        manager.transaction.mockImplementation(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        const transaction = jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
            callback(manager as unknown as EntityManager),
        )
        store = new TypeOrmVerificationExecutionPermitStore({
            transaction,
            manager: manager as unknown as EntityManager,
        } as unknown as DataSource)
    })

    describe('tryAcquire', () => {
        it('prunes expired permits, then admits a new one under the cap', async () => {
            const acquired = await store.tryAcquire('lease-1', organizationId, now, expiresAt, 5)

            expect(acquired).toBe(true)
            expect(manager.delete).toHaveBeenCalledWith(
                VerificationExecutionPermitEntity,
                expect.objectContaining({ expiresAt: expect.anything() }),
            )
            expect(manager.save).toHaveBeenCalledWith(
                VerificationExecutionPermitEntity,
                expect.objectContaining({ leaseId: 'lease-1', organizationId, expiresAt }),
            )
        })

        it('refuses to admit once the cap is reached', async () => {
            manager.count.mockResolvedValue(5)

            await expect(store.tryAcquire('lease-1', organizationId, now, expiresAt, 5)).resolves.toBe(false)
            expect(manager.save).not.toHaveBeenCalled()
        })

        it('bootstraps the singleton lock row lazily on first use', async () => {
            await store.tryAcquire('lease-1', organizationId, now, expiresAt, 5)

            expect(manager.transaction).toHaveBeenCalled()
            expect(manager.findOneOrFail).toHaveBeenCalledWith(
                VerificationExecutionPermitLockEntity,
                expect.objectContaining({ where: { id: 'global' }, lock: { mode: 'pessimistic_write' } }),
            )
        })

        it('recovers when the lock row already exists, without failing the transaction', async () => {
            manager.transaction.mockRejectedValueOnce({ code: '23505' })

            await expect(store.tryAcquire('lease-1', organizationId, now, expiresAt, 5)).resolves.toBe(true)
        })

        it('rethrows an unexpected bootstrap error rather than treating it as an existing lock row', async () => {
            manager.transaction.mockRejectedValueOnce(new Error('unexpected'))

            await expect(store.tryAcquire('lease-1', organizationId, now, expiresAt, 5)).rejects.toThrow('unexpected')
        })
    })

    describe('renew', () => {
        it('reports success when a row was updated', async () => {
            await expect(store.renew('lease-1', expiresAt)).resolves.toBe(true)
            expect(manager.update).toHaveBeenCalledWith(VerificationExecutionPermitEntity, { leaseId: 'lease-1' }, { expiresAt })
        })

        it('reports failure when no row matched', async () => {
            manager.update.mockResolvedValue({ affected: 0 })

            await expect(store.renew('lease-1', expiresAt)).resolves.toBe(false)
        })
    })

    it('releases a permit unconditionally', async () => {
        await store.release('lease-1')
        expect(manager.delete).toHaveBeenCalledWith(VerificationExecutionPermitEntity, { leaseId: 'lease-1' })
    })
})
