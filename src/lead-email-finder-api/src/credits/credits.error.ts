export class InsufficientCreditsException extends Error {
    name = 'InsufficientCreditsException'

    constructor(organizationId: string) {
        super(`Insufficient credits for organization: ${organizationId}`)
    }
}
