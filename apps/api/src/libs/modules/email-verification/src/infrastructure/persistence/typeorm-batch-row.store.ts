import { DataSource } from 'typeorm'
import { BatchRowRecord, BatchRowStore } from '../../application/delivery/batch/batch-row-store'
import { BatchRowEntity } from './typeorm/batch-row.entity'

function toRecord(entity: BatchRowEntity): BatchRowRecord {
    return {
        batchId: entity.batchId,
        sourceRow: entity.sourceRow,
        originalEmail: entity.originalEmail,
        normalizedAddress: entity.normalizedAddress,
    }
}

export class TypeOrmBatchRowStore implements BatchRowStore {
    constructor(private readonly dataSource: DataSource) {}

    async insertMany(organizationId: string, rows: readonly BatchRowRecord[]): Promise<void> {
        if (rows.length === 0) return
        await this.dataSource
            .createQueryBuilder()
            .insert()
            .into(BatchRowEntity)
            .values(rows.map(row => ({ ...row, organizationId })))
            .orIgnore()
            .execute()
    }

    async pageBySourceRow(
        batchId: string,
        organizationId: string,
        skip: number,
        take: number,
    ): Promise<readonly BatchRowRecord[]> {
        const entities = await this.dataSource.manager.find(BatchRowEntity, {
            where: { batchId, organizationId },
            order: { sourceRow: 'ASC' },
            skip,
            take,
        })
        return entities.map(toRecord)
    }

    async countRows(batchId: string, organizationId: string): Promise<number> {
        return this.dataSource.manager.count(BatchRowEntity, { where: { batchId, organizationId } })
    }
}
