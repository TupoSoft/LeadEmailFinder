import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export enum CreditPurchaseStatus {
    PENDING = 'pending',
    PAID = 'paid',
    FAILED = 'failed',
    EXPIRED = 'expired',
}

@Entity('credit_purchases')
@Index(['organizationId'])
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

    @Column({ nullable: true, unique: true })
    providerReference?: string | null

    @Column({ type: 'enum', enum: CreditPurchaseStatus, default: CreditPurchaseStatus.PENDING })
    status: CreditPurchaseStatus

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
