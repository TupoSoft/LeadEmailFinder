import { Column, Entity, PrimaryColumn } from 'typeorm'
import { SmtpVerificationReason } from './smtp.enums'

@Entity('smtp_verifications')
export class SmtpVerification {
    @PrimaryColumn('text')
    id: string

    @Column({ type: 'enum', enum: SmtpVerificationReason })
    reason: SmtpVerificationReason

    @Column({ type: 'boolean', nullable: true })
    exists?: boolean

    @Column({ nullable: true })
    targetExchange?: string

    @Column({ nullable: true })
    proxyId?: string
}
