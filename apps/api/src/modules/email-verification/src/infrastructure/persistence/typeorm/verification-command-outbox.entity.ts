import type { VerificationCommand } from '@tuposoft/lead-email-finder-verification-contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

/** Command publication is retried independently of the execution's result/settlement state. */
@Entity('verification_command_outbox')
@Index(['publishedAt', 'createdAt'])
export class VerificationCommandOutboxEntity {
    @PrimaryColumn('uuid')
    attemptId: string

    @Column('uuid')
    executionId: string

    @Column('uuid')
    organizationId: string

    @Column('jsonb')
    command: VerificationCommand

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt: Date | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date
}
