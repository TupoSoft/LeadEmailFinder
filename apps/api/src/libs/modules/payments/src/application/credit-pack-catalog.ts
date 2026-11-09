import { CreditPack, CreditPackNotFoundError } from '../domain/credit-pack'

export type CustomerCreditPack = Readonly<Pick<CreditPack, 'id' | 'credits' | 'amountMinor' | 'currency'>>

export class CreditPackCatalog {
    private readonly packs: Readonly<Record<string, CreditPack>>

    constructor(rawCreditPacks: string) {
        this.packs = parseCreditPacks(rawCreditPacks)
    }

    listForCustomer(): readonly CustomerCreditPack[] {
        return Object.freeze(
            Object.values(this.packs)
                .map(({ id, credits, amountMinor, currency }) => Object.freeze({ id, credits, amountMinor, currency }))
                .sort(
                    (left, right) =>
                        left.credits - right.credits || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
                ),
        )
    }

    get(packId: string): CreditPack {
        const pack = this.packs[packId]

        if (!Object.hasOwn(this.packs, packId)) {
            throw new CreditPackNotFoundError(packId)
        }

        return pack
    }
}

function parseCreditPacks(raw: string): Readonly<Record<string, CreditPack>> {
    let parsed: unknown

    try {
        parsed = JSON.parse(raw)
    } catch {
        throw new Error('PAYMENTS_CREDIT_PACKS must be valid JSON')
    }

    if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
        throw new Error('PAYMENTS_CREDIT_PACKS must define at least one credit pack')
    }

    const packs = Object.fromEntries(
        Object.entries(parsed).map(([id, candidate]) => [id, parseCreditPack(id, candidate)]),
    )
    return Object.freeze(packs)
}

function parseCreditPack(id: string, candidate: unknown): CreditPack {
    if (
        id.length === 0 ||
        !isRecord(candidate) ||
        !isPositiveInteger(candidate['credits']) ||
        !isPositiveInteger(candidate['amountMinor']) ||
        typeof candidate['currency'] !== 'string' ||
        !/^[A-Z]{3}$/.test(candidate['currency']) ||
        typeof candidate['providerPriceId'] !== 'string' ||
        candidate['providerPriceId'].length === 0
    ) {
        throw new Error(`Invalid credit pack configuration: ${id || '<empty>'}`)
    }

    return Object.freeze({
        id,
        credits: candidate['credits'],
        amountMinor: candidate['amountMinor'],
        currency: candidate['currency'],
        providerPriceId: candidate['providerPriceId'],
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
}
