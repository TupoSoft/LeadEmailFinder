import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import {
    VerificationBillingState,
    VerificationDeliveryMode,
    VerificationFinalReason,
    VerificationRequestSource,
} from '../../../application/ports/verification-request-store'

const DELIVERY_MODES = [
    'sync',
    'async',
    'batch',
    'batch_child',
] as const satisfies readonly VerificationDeliveryMode[]
const REQUEST_SOURCES = ['fresh', 'cache', 'shared', 'cooldown'] as const satisfies readonly VerificationRequestSource[]
const BILLING_STATES = ['pending', 'settled'] as const satisfies readonly VerificationBillingState[]
const FINAL_REASONS = [
    'conclusive',
    'cached',
    'shared',
    'inconclusive',
    'failed',
] as const satisfies readonly VerificationFinalReason[]

/** One caller submission. `requestId` is the public recovery handle. A repeated `clientRequestKey` within one
 *  organization always replays the same row; only the payer request ever reserves or charges a credit. */
@Entity('verification_requests')
@Index('UQ_verification_requests_organization_key', ['organizationId', 'clientRequestKey'], {
    unique: true,
    where: '"clientRequestKey" IS NOT NULL',
})
@Index(['organizationId', 'normalizedAddress', 'createdAt'])
export class VerificationRequestEntity {
    @PrimaryColumn('uuid')
    requestId: string

    @Column('uuid')
    organizationId: string

    @Column()
    normalizedAddress: string

    @Column({ type: 'enum', enum: DELIVERY_MODES })
    deliveryMode: VerificationDeliveryMode

    @Column({ type: 'text', nullable: true })
    clientRequestKey: string | null

    @Column({ type: 'uuid', nullable: true })
    executionId: string | null

    @Column({ type: 'uuid', nullable: true })
    resultId: string | null

    @Column({ type: 'enum', enum: REQUEST_SOURCES })
    source: VerificationRequestSource

    @Column({ type: 'enum', enum: BILLING_STATES, default: 'pending' })
    billingState: VerificationBillingState

    @Column({ type: 'smallint', default: 0 })
    reservedCount: 0 | 1

    @Column({ type: 'smallint', default: 0 })
    chargedCount: 0 | 1

    @Column({ type: 'enum', enum: FINAL_REASONS, nullable: true })
    finalReason: VerificationFinalReason | null

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    settledAt: Date | null
}
