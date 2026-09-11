export const CREDIT_RESERVATION_STORE = Symbol('CREDIT_RESERVATION_STORE')

export type CreditReservationState = 'reserved' | 'captured' | 'released'

export interface CreditReservationItem {
    readonly operationId: string
    readonly amount: number
}

export interface CreditReservationRecord {
    readonly operationId: string
    readonly amount: number
    readonly state: CreditReservationState
    readonly createdAt: Date
    readonly updatedAt: Date
    readonly settledAt: Date | null
}

export interface CreditReservationAdmission extends CreditReservationRecord {
    readonly disposition: 'inserted' | 'existing'
}

export interface CreditReservationSettlement extends CreditReservationRecord {
    readonly disposition: 'applied' | 'replayed'
}

export type CreditReservationAdmissionOutcome =
    | { readonly kind: 'admitted'; readonly reservations: readonly CreditReservationAdmission[] }
    | { readonly kind: 'insufficient-balance' }
    | { readonly kind: 'amount-conflict'; readonly operationId: string }

export type CreditReservationSettlementOutcome =
    | { readonly kind: 'settled'; readonly reservation: CreditReservationSettlement }
    | { readonly kind: 'missing' }
    | { readonly kind: 'conflict' }

export type CreditReservationClosureOutcome =
    | { readonly kind: 'closed'; readonly reservations: readonly CreditReservationSettlement[] }
    | { readonly kind: 'amount-conflict'; readonly operationId: string }
    | { readonly kind: 'already-captured'; readonly operationId: string }

/**
 * Atomic, organization-scoped credit-hold persistence backing `credits`' reservation business rules. The account
 * is the sole serialization point: every mutation locks it before reading or writing reservation rows, so
 * concurrent operations for one organization always resolve through that single lock. Callers supply
 * already-validated input (unique operation IDs, positive integer amounts); this port performs no business
 * validation of its own.
 */
export interface CreditReservationStore {
    /**
     * Admits a complete group atomically. An existing reservation with a matching amount is observed, not
     * recreated; one with a different amount conflicts the entire group. If the aggregate amount needed for
     * missing operation IDs exceeds available credits, no new reservation and no balance change occur. A single
     * reservation is a group of one.
     */
    reserveMany(
        organizationId: string,
        items: readonly CreditReservationItem[],
    ): Promise<CreditReservationAdmissionOutcome>

    getReservation(organizationId: string, operationId: string): Promise<CreditReservationRecord | null>

    /**
     * Captures an existing reservation: moves it to `captured`, decreases both balance and reserved by its
     * amount, and records a debit under the private `verification-reservation:<operationId>` reference. Repeating
     * the same transition replays its recorded outcome; the opposite transition or a preexisting unexpected debit
     * reference conflicts without mutation.
     */
    capture(organizationId: string, operationId: string): Promise<CreditReservationSettlementOutcome>

    /** Releases an existing reservation: moves it to `released` and decreases only reserved. No total credit moves. */
    release(organizationId: string, operationId: string): Promise<CreditReservationSettlementOutcome>

    /**
     * Closes a complete, immutable admission list after its owner has durably fenced denial or cancellation.
     * Inspects every ID before changing any row: an existing captured receipt or amount mismatch conflicts the
     * whole closure. A reserved receipt is released; a missing ID gets a durable released receipt with no
     * preceding hold, blocking a later delayed reservation. Total balance never changes; no grant or debit is
     * inserted. Replaying a confirmed closure returns the same records.
     */
    closeAdmissionMany(
        organizationId: string,
        items: readonly CreditReservationItem[],
    ): Promise<CreditReservationClosureOutcome>
}
