import { DataSource, EntityManager } from 'typeorm'
import { BatchRowEntity } from './typeorm/batch-row.entity'
import { TypeOrmBatchRowStore } from './typeorm-batch-row.store'

const organizationId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'

describe('TypeOrmBatchRowStore', () => {
    let manager: { find: jest.Mock; count: jest.Mock }
    let queryBuilder: { insert: jest.Mock; into: jest.Mock; values: jest.Mock; orIgnore: jest.Mock; execute: jest.Mock }
    let store: TypeOrmBatchRowStore

    beforeEach(() => {
        manager = { find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }
        queryBuilder = {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue(undefined),
        }
        store = new TypeOrmBatchRowStore({
            manager: manager as unknown as EntityManager,
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        } as unknown as DataSource)
    })

    it('skips the insert entirely for an empty row list', async () => {
        await store.insertMany(organizationId, [])
        expect(queryBuilder.execute).not.toHaveBeenCalled()
    })

    it('inserts rows ignoring conflicts, stamping the organization', async () => {
        await store.insertMany(organizationId, [{ batchId, sourceRow: 1, originalEmail: 'A@Example.test', normalizedAddress: 'a@example.test' }])
        expect(queryBuilder.into).toHaveBeenCalledWith(BatchRowEntity)
        expect(queryBuilder.values).toHaveBeenCalledWith([
            { batchId, sourceRow: 1, originalEmail: 'A@Example.test', normalizedAddress: 'a@example.test', organizationId },
        ])
        expect(queryBuilder.orIgnore).toHaveBeenCalled()
    })

    it('pages rows ordered by source row', async () => {
        await store.pageBySourceRow(batchId, organizationId, 0, 500)
        expect(manager.find).toHaveBeenCalledWith(BatchRowEntity, {
            where: { batchId, organizationId },
            order: { sourceRow: 'ASC' },
            skip: 0,
            take: 500,
        })
    })

    it('counts rows for a batch', async () => {
        manager.count.mockResolvedValue(42)
        await expect(store.countRows(batchId, organizationId)).resolves.toBe(42)
        expect(manager.count).toHaveBeenCalledWith(BatchRowEntity, { where: { batchId, organizationId } })
    })
})
