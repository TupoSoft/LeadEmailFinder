export class InsufficientCreditsException extends Error {
    name = 'InsufficientCreditsException'

    constructor(token: string) {
        super(`Insufficient credits for API key: ${token}`)
    }
}
