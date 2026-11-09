import {
    CreditReservationAdmission,
    CreditReservationItem,
    CreditReservationRecord,
    CreditReservationSettlement,
    CreditReservationStore,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    CreditReservationAmountConflict,
    CreditReservationConflict,
    CreditReservationNotFound,
    InsufficientCreditsException,
} from '../domain/credits.error'

export interface ReservationRecord {
    readonly operationId: string
    readonly amount: number
    readonly state: 'reserved' | 'captured' | 'released'
    readonly createdAt: Date
    readonly updatedAt: Date
    readonly settledAt: Date | null
}

export interface ReservationAdmission extends ReservationRecord {
    readonly disposition: 'inserted' | 'existing'
}

export interface ReservationSettlement extends ReservationRecord {
    readonly disposition: 'applied' | 'replayed'
}

export interface ReservationInput {
    readonly operationId: string
    readonly amount: number
}

function toReservationRecord(record: CreditReservationRecord): ReservationRecord {
    return {
        operationId: record.operationId,
        amount: record.amount,
        state: record.state,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        settledAt: record.settledAt,
    }
}

function toReservationAdmission(admission: CreditReservationAdmission): ReservationAdmission {
    return { ...toReservationRecord(admission), disposition: admission.disposition }
}

function toReservationSettlement(settlement: CreditReservationSettlement): ReservationSettlement {
    return { ...toReservationRecord(settlement), disposition: settlement.disposition }
}

function validateItems(items: readonly ReservationInput[]): readonly CreditReservationItem[] {
    if (items.length === 0) {
        throw new Error('Reservation admission requires at least one item')
    }

    const seenOperationIds = new Set<string>()
    let total = 0
    for (const { operationId, amount } of items) {
        if (typeof operationId !== 'string' || operationId.length === 0) {
            throw new Error('Reservation operation ID must be a nonempty string')
        }
        if (seenOperationIds.has(operationId)) {
            throw new Error('Reservation admission cannot repeat an operation ID')
        }
        seenOperationIds.add(operationId)
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error('Reservation amount must be a positive safe integer')
        }
        total += amount
        if (!Number.isSafeInteger(total)) {
            throw new Error('Reservation admission amount total is too large')
        }
    }

    return items
}

export class CreditReservationService {
    constructor(private readonly store: CreditReservationStore) {}

    async reserve(organizationId: string, item: ReservationInput): Promise<ReservationAdmission> {
        const [reservation] = await this.reserveMany(organizationId, [item])
        return reservation
    }

    async reserveMany(
        organizationId: string,
        items: readonly ReservationInput[],
    ): Promise<readonly ReservationAdmission[]> {
        const validated = validateItems(items)
        const outcome = await this.store.reserveMany(organizationId, validated)

        if (outcome.kind === 'insufficient-balance') {
            throw new InsufficientCreditsException(organizationId)
        }
        if (outcome.kind === 'amount-conflict') {
            throw new CreditReservationAmountConflict(outcome.operationId)
        }
        return outcome.reservations.map(toReservationAdmission)
    }

    async getReservation(organizationId: string, operationId: string): Promise<ReservationRecord | null> {
        const record = await this.store.getReservation(organizationId, operationId)
        return record ? toReservationRecord(record) : null
    }

    async capture(organizationId: string, operationId: string): Promise<ReservationSettlement> {
        return this.settleOrThrow(await this.store.capture(organizationId, operationId))
    }

    async release(organizationId: string, operationId: string): Promise<ReservationSettlement> {
        return this.settleOrThrow(await this.store.release(organizationId, operationId))
    }

    async closeAdmissionMany(
        organizationId: string,
        items: readonly ReservationInput[],
    ): Promise<readonly ReservationSettlement[]> {
        const validated = validateItems(items)
        const outcome = await this.store.closeAdmissionMany(organizationId, validated)

        if (outcome.kind === 'amount-conflict' || outcome.kind === 'already-captured') {
            throw new CreditReservationConflict()
        }
        return outcome.reservations.map(toReservationSettlement)
    }

    private settleOrThrow(outcome: Awaited<ReturnType<CreditReservationStore['capture']>>): ReservationSettlement {
        if (outcome.kind === 'missing') {
            throw new CreditReservationNotFound()
        }
        if (outcome.kind === 'conflict') {
            throw new CreditReservationConflict()
        }
        return toReservationSettlement(outcome.reservation)
    }
}
