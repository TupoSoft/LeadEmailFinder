import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import {
    BatchAdmissionState,
    BatchFinalizationState,
    BatchFundingDecision,
} from '../../../application/delivery/batch/batch-admission-store'

const BATCH_ADMISSION_STATES = [
    'validating',
    'admitting',
    'funding',
    'admitted',
    'insufficient_credits',
    'invalid',
] as const satisfies readonly BatchAdmissionState[]
const FUNDING_DECISIONS = ['pending', 'approved', 'denied', 'closed'] as const satisfies readonly BatchFundingDecision[]
const FINALIZATION_STATES = ['preparing', 'ready'] as const satisfies readonly BatchFinalizationState[]

/** One batch upload's manifest metadata. `batchId` is the same identifier used as the BullMQ job ID. */
@Entity('batch_admissions')
@Index('IDX_batch_admissions_recovery', ['updatedAt', 'batchId'])
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

    @Column({ type: 'enum', enum: FUNDING_DECISIONS, default: 'pending' })
    fundingDecision: BatchFundingDecision

    @Column({ type: 'enum', enum: FINALIZATION_STATES, default: 'preparing' })
    finalizationState: BatchFinalizationState

    /** The current admission owner; null when no worker holds the group. */
    @Column({ type: 'uuid', nullable: true })
    admissionLeaseOwnerId: string | null

    @Column({ type: 'timestamptz', nullable: true })
    admissionLeaseExpiresAt: Date | null

    /** Incremented by every lease acquisition, so an earlier owner's writes fail even after it was released. */
    @Column({ type: 'int', default: 0 })
    admissionGeneration: number

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
