import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { ISmtpVerificationResponse } from '@tuposoft/lead-email-finder/common'

const SMTP_VERIFICATION_REASONS = [
    'accepted_email',
    'rejected_email',
    'timeout',
    'temporarily_blocked',
    'no_mx_records',
    'unexpected_error',
    'blacklisted',
    'no_connect',
    'exceeded_storage',
    'sender_blocked',
    'secure_transport_unavailable',
    'unknown',
] as const satisfies readonly ISmtpVerificationResponse['reason'][]

@Entity('smtp_verifications')
@Index(['organizationId', 'updatedAt'])
export class SmtpVerificationEntity {
    @PrimaryColumn('uuid')
    organizationId: string

    @PrimaryColumn('text')
    id: string

    @Column({ type: 'enum', enum: SMTP_VERIFICATION_REASONS })
    reason: ISmtpVerificationResponse['reason']

    @Column({ type: 'boolean', nullable: true })
    exists: boolean | null

    @Column({ type: 'boolean', default: false })
    secureTransport: boolean

    @Column({ nullable: true })
    targetExchange?: string

    @Column({ nullable: true })
    proxyId?: string

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
