import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/** One held slot against the global outbound-execution concurrency cap. A row's presence with `expiresAt` in the
 *  future counts against the cap; expired rows are pruned lazily by the store that owns the singleton lock row
 *  below, so a crashed holder cannot permanently shrink capacity. */
@Entity('verification_execution_permits')
@Index(['expiresAt'])
export class VerificationExecutionPermitEntity {
    @PrimaryColumn('uuid')
    leaseId: string

    @Column('uuid')
    organizationId: string

    @Column({ type: 'timestamptz' })
    expiresAt: Date
}
