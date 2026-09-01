export interface CreditPack {
    id: string
    credits: number
    amountMinor: number
    currency: string
    providerPriceId: string
}

export class CreditPackNotFoundError extends Error {
    constructor(packId: string) {
        super(`Unknown credit pack: ${packId}`)
        this.name = CreditPackNotFoundError.name
    }
}
