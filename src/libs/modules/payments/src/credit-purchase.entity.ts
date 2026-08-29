import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export enum CreditPurchaseStatus {
    PENDING = 'pending',
    PAID = 'paid',
    FAILED = 'failed',
    EXPIRED = 'expired',
}

@Entity('credit_purchases')
@Index(['organizationId'])
@Check('CHK_credit_purchases_provider_total_positive', '"providerTotalMinor" IS NULL OR "providerTotalMinor" > 0')
export class CreditPurchase {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column('uuid')
    organizationId: string

    @Column()
    packId: string

    @Column({ type: 'int' })
    credits: number

    @Column({ type: 'int' })
    amountMinor: number

    @Column({ length: 3 })
    currency: string

    @Column()
    provider: string

    @Column({ type: 'varchar', nullable: true, unique: true })
    providerReference?: string | null

    @Column({ type: 'int', nullable: true })
    providerTotalMinor?: number | null

    @Column({ type: 'enum', enum: CreditPurchaseStatus, default: CreditPurchaseStatus.PENDING })
    status: CreditPurchaseStatus

    @Column({ type: 'timestamptz', nullable: true })
    creditsGrantedAt?: Date | null

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
