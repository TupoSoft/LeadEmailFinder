import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import { BatchUniqueAddressAdmissionKind } from '../../../application/delivery/batch/batch-admission-store'

const ADMISSION_KINDS = ['cache', 'shared', 'created', 'cooldown'] as const satisfies readonly BatchUniqueAddressAdmissionKind[]

/** The immutable per-address admission manifest for one batch. `admissionKind` is null until the admission pass
 *  resolves that address; the exact set of executions this batch must fund is every row where it is `'created'`. */
@Entity('batch_unique_addresses')
@Index(['batchId', 'admissionKind'])
export class BatchUniqueAddressEntity {
    @PrimaryColumn('uuid')
    batchId: string

    @PrimaryColumn()
    normalizedAddress: string

    @Column('uuid')
    organizationId: string

    @Column({ type: 'int' })
    firstSeenRow: number

    @Column({ type: 'enum', enum: ADMISSION_KINDS, nullable: true })
    admissionKind: BatchUniqueAddressAdmissionKind | null

    @Column({ type: 'uuid', nullable: true })
    executionId: string | null

    @Column({ type: 'uuid', nullable: true })
    resultId: string | null

    @Column({ type: 'uuid', nullable: true })
    payerRequestId: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date
}
