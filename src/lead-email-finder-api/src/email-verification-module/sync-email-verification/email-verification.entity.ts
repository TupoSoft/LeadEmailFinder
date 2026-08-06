import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { AutoMap } from '@automapper/classes'

@Entity('email_verifications')
@Index(['email', 'batchId'])
export class EmailVerification {
    @PrimaryGeneratedColumn('uuid')
    @AutoMap()
    id: string

    @Column()
    @AutoMap()
    email: string

    @Column()
    @AutoMap()
    domain: string

    @Column()
    @AutoMap()
    localPart: string

    @Column({ type: 'enum', enum: EmailPatternEnum, nullable: true })
    @AutoMap(() => String)
    format?: EmailPatternEnum

    @Column({ nullable: true })
    @AutoMap()
    targetExchange?: string

    @Column({ nullable: true })
    @AutoMap()
    mxDomain?: string

    @Column({ type: 'boolean', nullable: true, default: null })
    @AutoMap(() => Boolean)
    exists: boolean | null

    @Column({ type: 'boolean', nullable: true, default: null })
    @AutoMap(() => Boolean)
    catchAll: boolean | null

    @Column({ type: 'enum', enum: EmailVerificationReason })
    @AutoMap(() => String)
    reason: EmailVerificationReason

    @Column({ type: 'simple-array' })
    @AutoMap(() => [String])
    sources: EmailVerificationSource[]

    @CreateDateColumn()
    createdAt: Date

    @Column({ nullable: true })
    batchId?: string
}
