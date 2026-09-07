import { CreditPackCatalog } from './credit-pack-catalog'
import { CreditPackNotFoundError } from '../domain/credit-pack'

describe('CreditPackCatalog', () => {
    const configuredPacks = JSON.stringify({
        starter: {
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            providerPriceId: 'price_starter',
        },
    })

    it('returns an immutable server-configured pack', () => {
        const catalog = new CreditPackCatalog(configuredPacks)

        const pack = catalog.get('starter')

        expect(pack).toEqual({
            id: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            providerPriceId: 'price_starter',
        })
        expect(Object.isFrozen(pack)).toBe(true)
    })

    it.each(['missing', '__proto__', 'toString'])('rejects unconfigured pack %s', packId => {
        const catalog = new CreditPackCatalog(configuredPacks)

        expect(() => catalog.get(packId)).toThrow(new CreditPackNotFoundError(packId))
    })

    it('returns an immutable defensive customer projection ordered by credits then ID', () => {
        const internalPack = { credits: 100, amountMinor: 500, currency: 'USD', providerPriceId: 'private-price' }
        const catalog = new CreditPackCatalog(
            JSON.stringify({
                large: { ...internalPack, credits: 1000 },
                z: internalPack,
                a: internalPack,
            }),
        )
        const projection = catalog.listForCustomer()
        expect(projection).toEqual([
            { id: 'a', credits: 100, amountMinor: 500, currency: 'USD' },
            { id: 'z', credits: 100, amountMinor: 500, currency: 'USD' },
            { id: 'large', credits: 1000, amountMinor: 500, currency: 'USD' },
        ])
        expect(Object.isFrozen(projection)).toBe(true)
        expect(projection.every(Object.isFrozen)).toBe(true)
        expect(projection[0]).not.toBe(catalog.get('a'))
        expect(() => {
            ;(projection[0] as { credits: number }).credits = 1
        }).toThrow(TypeError)
        expect(catalog.get('a').credits).toBe(100)
    })

    it.each([
        ['invalid JSON', '{'],
        ['an empty catalog', '{}'],
        [
            'non-positive credits',
            JSON.stringify({
                starter: { credits: 0, amountMinor: 500, currency: 'USD', providerPriceId: 'price_starter' },
            }),
        ],
        [
            'a malformed currency',
            JSON.stringify({
                starter: { credits: 100, amountMinor: 500, currency: 'usd', providerPriceId: 'price_starter' },
            }),
        ],
    ])('rejects %s', (_scenario, value) => {
        expect(() => new CreditPackCatalog(value)).toThrow()
    })
})
