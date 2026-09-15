import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { BatchAdmissionState } from '../../../application/delivery/batch/batch-admission-store'

const BATCH_ADMISSION_STATES = [
    'validating',
    'admitting',
    'admitted',
    'insufficient_credits',
    'invalid',
] as const satisfies readonly BatchAdmissionState[]

/** One batch upload's manifest metadata. `batchId` is the same identifier used as the BullMQ job ID. */
@Entity('batch_admissions')
@Index('UQ_batch_admissions_organization_key', ['organizationId', 'clientRequestKey'], {
    unique: true,
    where: '"clientRequestKey" IS NOT NULL',
})
export class BatchAdmissionEntity {
    @PrimaryColumn('uuid')
    batchId: string

    @Column('uuid')
    organizationId: string

    @Column({ type: 'enum', enum: BATCH_ADMISSION_STATES })
    state: BatchAdmissionState

    @Column({ type: 'int', default: 0 })
    totalRows: number

    @Column({ type: 'int', default: 0 })
    uniqueAddressCount: number

    @Column({ type: 'text', nullable: true })
    clientRequestKey: string | null

    @Column({ type: 'text', nullable: true })
    contentDigest: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
