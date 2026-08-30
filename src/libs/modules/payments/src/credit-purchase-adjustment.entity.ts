import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm'
import { CreditPurchase } from './credit-purchase.entity'

export enum CreditPurchaseAdjustmentDirection {
    DEBIT = 'debit',
    RESTORE = 'restore',
}

export enum CreditPurchaseAdjustmentState {
    CLAIMED = 'claimed',
    COMPLETED = 'completed',
}

@Entity('credit_purchase_adjustments')
@Index(['purchaseId'])
@Check(
    'CHK_credit_purchase_adjustments_nonnegative',
    '"amountMinor" >= 0 AND "effectiveAmountMinor" >= 0 AND "requestedCredits" >= 0 AND "operationCredits" >= 0 AND "appliedDebit" >= 0 AND "restoredCredits" >= 0 AND "originalShortfallCredits" >= 0 AND "shortfallCredits" >= 0 AND "shortfallClearedCredits" >= 0',
)
export class CreditPurchaseAdjustment {
    @PrimaryColumn()
    providerAdjustmentId: string

    @Column('uuid')
    purchaseId: string

    @ManyToOne(() => CreditPurchase, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseId' })
    purchase: CreditPurchase

    @Column()
    providerEventId: string

    @Column({ type: 'enum', enum: CreditPurchaseAdjustmentDirection })
    direction: CreditPurchaseAdjustmentDirection

    @Column({ type: 'int' })
    amountMinor: number

    @Column()
    isFull: boolean

    @Column({ type: 'int' })
    effectiveAmountMinor: number

    @Column({ length: 3 })
    currency: string

    @Column({ type: 'int' })
    requestedCredits: number

    @Column({ type: 'int' })
    operationCredits: number

    @Column({ type: 'int', default: 0 })
    appliedDebit: number

    @Column({ type: 'int', default: 0 })
    restoredCredits: number

    @Column({ type: 'int', default: 0 })
    originalShortfallCredits: number

    @Column({ type: 'int', default: 0 })
    shortfallCredits: number

    @Column({ type: 'int', default: 0 })
    shortfallClearedCredits: number

    @Column({ type: 'enum', enum: CreditPurchaseAdjustmentState, default: CreditPurchaseAdjustmentState.CLAIMED })
    state: CreditPurchaseAdjustmentState

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date
}
