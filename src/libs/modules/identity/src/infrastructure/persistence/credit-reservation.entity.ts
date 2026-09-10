import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm'
import { CreditReservationState } from '../../application/ports/credit-reservation-store'
import { Organization } from './organization.entity'

export const CREDIT_RESERVATION_STATES = [
    'reserved',
    'captured',
    'released',
] as const satisfies readonly CreditReservationState[]

@Entity('credit_reservations')
@Check('CHK_credit_reservations_amount_positive', '"amount" > 0')
export class CreditReservation {
    @PrimaryColumn({ type: 'uuid' })
    organizationId: string

    @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organizationId' })
    organization: Organization

    @PrimaryColumn({ type: 'uuid' })
    operationId: string

    @Column({ type: 'integer' })
    amount: number

    @Column({ type: 'enum', enum: CREDIT_RESERVATION_STATES })
    state: CreditReservationState

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    settledAt: Date | null
}
