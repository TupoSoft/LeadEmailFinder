import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** One original CSV data row for a batch upload, preserving its exact spelling and one-based position so the
 *  output CSV can reproduce every input row, including duplicates, after admission deduplicates by address. */
@Entity('batch_rows')
@Index(['batchId', 'normalizedAddress'])
export class BatchRowEntity {
    @PrimaryColumn('uuid')
    batchId: string

    @PrimaryColumn({ type: 'int' })
    sourceRow: number

    @Column('uuid')
    organizationId: string

    @Column()
    originalEmail: string

    @Column()
    normalizedAddress: string
}
