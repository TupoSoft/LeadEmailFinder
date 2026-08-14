import { Check, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { Organization } from './organization.entity'

@Entity('organization_credit_accounts')
@Check('CHK_organization_credit_accounts_balance_nonnegative', '"balance" >= 0')
export class OrganizationCreditAccount {
    @PrimaryColumn({ type: 'uuid' })
    organizationId: string

    @OneToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @Column({ type: 'integer', default: 0 })
    balance: number

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date
}
