import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Organization } from './organization.entity'

@Entity('credit_debits')
export class CreditDebit {
    @PrimaryColumn({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @PrimaryColumn()
    reference: string

    @Column({ type: 'integer' })
    amount: number

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date
}
