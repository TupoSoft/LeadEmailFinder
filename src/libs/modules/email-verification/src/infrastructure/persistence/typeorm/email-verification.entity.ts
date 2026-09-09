import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import {
    EmailPatternEnum,
    EmailVerificationReadSource,
    EmailVerificationReason,
} from '@tuposoft/lead-email-finder/common'
import { VerificationQuality } from '../../../domain/verification-evidence'

const VERIFICATION_QUALITIES = ['conclusive_positive', 'conclusive_negative', 'inconclusive'] as const satisfies readonly VerificationQuality[]

@Entity('email_verifications')
@Index(['organizationId', 'email', 'createdAt'])
@Index(['organizationId', 'batchId'])
export class EmailVerificationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column('uuid')
    organizationId: string

    @Column()
    email: string

    @Column()
    domain: string

    @Column()
    localPart: string

    @Column({ type: 'enum', enum: EmailPatternEnum, nullable: true })
    format?: EmailPatternEnum

    @Column({ nullable: true })
    targetExchange?: string

    @Column({ nullable: true })
    mxDomain?: string

    @Column({ type: 'boolean', nullable: true, default: null })
    exists: boolean | null

    @Column({ type: 'boolean', nullable: true, default: null })
    catchAll: boolean | null

    @Column({ type: 'enum', enum: EmailVerificationReason })
    reason: EmailVerificationReason

    @Column({ type: 'simple-array' })
    sources: EmailVerificationReadSource[]

    @CreateDateColumn()
    createdAt: Date

    @Column({ nullable: true })
    batchId?: string

    @Column({ type: 'enum', enum: VERIFICATION_QUALITIES })
    verificationQuality: VerificationQuality

    @Column({ type: 'timestamptz', nullable: true })
    evidenceObservedAt: Date | null

    @Column({ type: 'int' })
    evidencePolicyVersion: number
}
