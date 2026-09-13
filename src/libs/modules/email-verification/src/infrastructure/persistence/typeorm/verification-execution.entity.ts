import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import {
    VerificationExecutionState,
    VerificationFundingOwnerType,
} from '../../../application/ports/verification-execution-store'

const EXECUTION_STATES = [
    'funding_pending',
    'queued',
    'running',
    'awaiting_retry',
    'settling',
    'completed',
    'canceled',
] as const satisfies readonly VerificationExecutionState[]
const FUNDING_OWNER_TYPES = ['single', 'batch_group'] as const satisfies readonly VerificationFundingOwnerType[]
const NONTERMINAL_STATES: readonly VerificationExecutionState[] = [
    'funding_pending',
    'queued',
    'running',
    'awaiting_retry',
    'settling',
]

/** The single shared execution for one organization/address. Only one nonterminal row may exist per address at
 *  a time (enforced by the partial unique index below); `attemptGeneration` fences lease renewal and takeover. */
@Entity('verification_executions')
@Index('UQ_verification_executions_nonterminal_address', ['organizationId', 'normalizedAddress'], {
    unique: true,
    where: `"state" IN (${NONTERMINAL_STATES.map(state => `'${state}'`).join(', ')})`,
})
@Index(['state', 'updatedAt'])
@Check('CHK_verification_executions_generation_nonnegative', '"attemptGeneration" >= 0')
export class VerificationExecutionEntity {
    @PrimaryColumn('uuid')
    executionId: string

    @Column('uuid')
    organizationId: string

    @Column()
    normalizedAddress: string

    @Column('uuid')
    payerRequestId: string

    @Column({ type: 'enum', enum: EXECUTION_STATES })
    state: VerificationExecutionState

    @Column({ type: 'enum', enum: FUNDING_OWNER_TYPES })
    fundingOwnerType: VerificationFundingOwnerType

    @Column('uuid')
    fundingOwnerId: string

    @Column({ type: 'int', default: 0 })
    attemptGeneration: number

    @Column({ type: 'text', nullable: true })
    leaseOwnerId: string | null

    @Column({ type: 'timestamptz', nullable: true })
    leaseExpiresAt: Date | null

    @Column({ type: 'uuid', nullable: true })
    resultId: string | null

    @Column({ type: 'timestamptz', nullable: true })
    retryAt: Date | null

    @Column({ type: 'timestamptz' })
    deadlineAt: Date

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
