import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { SmtpVerificationReason } from './smtp.enums'

@Entity('smtp_verifications')
@Index(['organizationId', 'updatedAt'])
export class SmtpVerification {
    @PrimaryColumn('uuid')
    organizationId: string

    @PrimaryColumn('text')
    id: string

    @Column({ type: 'enum', enum: SmtpVerificationReason })
    reason: SmtpVerificationReason

    @Column({ type: 'boolean', nullable: true })
    exists: boolean | null

    @Column({ nullable: true })
    targetExchange?: string

    @Column({ nullable: true })
    proxyId?: string

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
