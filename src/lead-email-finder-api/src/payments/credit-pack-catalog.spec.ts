import { ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from '../environment-variables.dto'
import { CreditPackCatalog, CreditPackNotFoundError } from './credit-pack-catalog'

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
        const catalog = createCatalog(configuredPacks)

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
        const catalog = createCatalog(configuredPacks)

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
        expect(() => createCatalog(value)).toThrow()
    })
})

function createCatalog(value: string): CreditPackCatalog {
    const configService = {
        getOrThrow: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService<EnvironmentVariablesDto, true>

    return new CreditPackCatalog(configService)
}
