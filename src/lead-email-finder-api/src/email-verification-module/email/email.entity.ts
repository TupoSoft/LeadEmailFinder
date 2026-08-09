import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'
import { AutoMap } from '@automapper/classes'

@Entity('emails')
export class Email {
    @PrimaryColumn('text')
    @AutoMap()
    id: string

    @Column()
    @AutoMap()
    username: string

    @Column()
    @AutoMap()
    domain: string

    @Column({ type: 'boolean', nullable: true })
    @AutoMap()
    exists: boolean | null

    @Column({ type: 'enum', enum: EmailPatternEnum, nullable: true })
    @AutoMap()
    format?: EmailPatternEnum

    @Column({ nullable: true })
    @AutoMap()
    lastVerificationId?: string

    @CreateDateColumn()
    @AutoMap()
    createdAt: Date

    @UpdateDateColumn()
    @AutoMap()
    updatedAt: Date

    @Column({ nullable: true })
    @AutoMap()
    lastVerifiedAt?: Date
}
