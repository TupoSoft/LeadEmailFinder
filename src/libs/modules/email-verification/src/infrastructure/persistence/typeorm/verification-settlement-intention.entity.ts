import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'
import {
    VerificationSettlementDecision,
    VerificationSettlementState,
} from '../../../application/ports/verification-settlement-store'

const SETTLEMENT_DECISIONS = ['capture', 'release'] as const satisfies readonly VerificationSettlementDecision[]
const SETTLEMENT_STATES = ['pending', 'confirmed'] as const satisfies readonly VerificationSettlementState[]

/** The immutable capture-or-release intention for one execution's result, persisted in the same transaction as
 *  the result itself. Exactly one row per execution ever exists (`executionId` is the primary key); confirming
 *  settlement replays the recorded outcome rather than re-deciding it. */
@Entity('verification_settlement_intentions')
export class VerificationSettlementIntentionEntity {
    @PrimaryColumn('uuid')
    executionId: string

    @Column('uuid')
    organizationId: string

    @Column({ type: 'enum', enum: SETTLEMENT_DECISIONS })
    decision: VerificationSettlementDecision

    @Column('uuid')
    resultId: string

    @Column({ type: 'enum', enum: SETTLEMENT_STATES, default: 'pending' })
    state: VerificationSettlementState

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    confirmedAt: Date | null
}
