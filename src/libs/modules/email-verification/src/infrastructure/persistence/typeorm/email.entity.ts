import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'

@Entity('emails')
@Index(['organizationId', 'updatedAt'])
export class EmailEntity {
    @PrimaryColumn('uuid')
    organizationId: string

    @PrimaryColumn('text')
    id: string

    @Column()
    username: string

    @Column()
    domain: string

    @Column({ type: 'boolean', nullable: true })
    exists: boolean | null

    @Column({ type: 'enum', enum: EmailPatternEnum, nullable: true })
    format?: EmailPatternEnum

    @Column({ nullable: true })
    lastVerificationId?: string

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date

    @Column({ nullable: true })
    lastVerifiedAt?: Date
}
