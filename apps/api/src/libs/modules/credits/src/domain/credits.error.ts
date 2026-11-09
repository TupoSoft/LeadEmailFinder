export class InsufficientCreditsException extends Error {
    name = 'InsufficientCreditsException'

    constructor(organizationId: string) {
        super(`Insufficient credits for organization: ${organizationId}`)
    }
}

export class CreditIdempotencyConflict extends Error {
    name = 'CreditIdempotencyConflict'

    constructor() {
        super('Idempotency-Key has already been used for a different credit amount')
    }
}

/** An absolute balance target is below credits already reserved for accepted operations. */
export class BalanceBelowReservedException extends Error {
    name = 'BalanceBelowReservedException'

    constructor(organizationId: string) {
        super(`Requested balance is below reserved credits for organization: ${organizationId}`)
    }
}

/** A reservation operation ID is already reserved under a different amount. */
export class CreditReservationAmountConflict extends Error {
    name = 'CreditReservationAmountConflict'

    constructor(readonly operationId: string) {
        super('Operation ID is already reserved under a different amount')
    }
}

/** Settlement or closure attempted on a reservation state that cannot accept the requested transition. */
export class CreditReservationConflict extends Error {
    name = 'CreditReservationConflict'

    constructor() {
        super('Reservation cannot accept this transition from its current state')
    }
}

/** Settlement was requested for an operation ID with no reservation. */
export class CreditReservationNotFound extends Error {
    name = 'CreditReservationNotFound'

    constructor() {
        super('No reservation exists for this operation ID')
    }
}
