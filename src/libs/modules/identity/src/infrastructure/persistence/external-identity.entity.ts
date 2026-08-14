import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('external_identities')
@Index('UQ_external_identities_issuer_subject', ['issuer', 'subject'], { unique: true })
export class ExternalIdentity {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    issuer: string

    @Column()
    subject: string

    @Column({ type: 'varchar', nullable: true })
    email: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
