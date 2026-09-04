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
