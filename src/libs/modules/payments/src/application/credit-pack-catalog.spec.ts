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

    it('rejects an unknown pack id', () => {
        const catalog = new CreditPackCatalog(configuredPacks)

        expect(() => catalog.get('missing')).toThrow(new CreditPackNotFoundError('missing'))
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
