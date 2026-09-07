import { beforeEach, describe, expect, it } from 'vitest'
import { clearCheckoutHint, readCheckoutHint, rememberCheckoutHint } from './checkout-return-hint'
import { safeCheckoutUrl } from './checkout-navigation'
import { formatCredits, formatMoney, formatPurchaseDate } from './format-billing'

describe('billing presentation contracts', () => {
    it.each([
        [500, 'USD', 'USD 5.00'],
        [1250, 'JPY', 'JPY 1,250'],
        [1234, 'KWD', 'KWD 1.234'],
        [0, 'EUR', 'EUR 0.00'],
    ])('formats %s minor units in %s with the currency fraction rules', (amount, currency, expected) => {
        expect(formatMoney(amount, currency).replace(/\s/g, ' ')).toBe(expected)
    })

    it('formats balances and dates without local timezone ambiguity', () => {
        expect(formatCredits(12500)).toBe('12,500')
        expect(formatPurchaseDate('2026-09-01T12:00:00.000Z')).toBe('Sep 1, 2026, 12:00 PM UTC')
        expect(formatPurchaseDate('invalid')).toBe('Date unavailable')
        expect(formatMoney(100, 'bad-currency')).toBe('Amount unavailable')
    })

    it('accepts the normalized same-origin stub destination', () => {
        expect(safeCheckoutUrl('http://LOCALHOST:53000/billing/complete?purchaseId=hint')).toBe(
            'http://localhost:53000/billing/complete?purchaseId=hint',
        )
    })

    it.each([
        '//localhost:53000/billing/complete',
        'http://localhost:53000@evil.test/pay',
        'http://localhost:53000.evil.test/pay',
        'https://localhost:53000/pay',
        'http://localhost:53000/pay#fragment',
        'http://user:password@localhost:53000/pay',
        'javascript:void(0)',
        'http://example.test/pay',
        'https://checkout.paddle.com/pay',
        'https://lοcalhost:53000/pay',
    ])('rejects an unsafe or unconfigured checkout URL without including it in the error', url => {
        expect(() => safeCheckoutUrl(url)).toThrow('Checkout is unavailable.')
    })
})

describe('checkout return hints', () => {
    const id = '12345678-1234-4234-8234-123456789012'
    beforeEach(() => sessionStorage.clear())

    it('reads only the UUID hint from query parameters', () => {
        expect(readCheckoutHint(`?purchaseId=${id}&status=paid&credits=90000&organizationId=other`)).toBe(id)
        expect(readCheckoutHint('?purchaseId=arbitrary&status=paid')).toBeUndefined()
    })

    it('retains only a short-lived same-tab hint and clears it after terminal state', () => {
        rememberCheckoutHint(id, 1000)
        expect(readCheckoutHint('', 1001)).toBe(id)
        const stored = JSON.parse(sessionStorage.getItem('lef-checkout-return')!) as Record<string, unknown>
        expect(Object.keys(stored)).toEqual(['id', 'expiresAt'])
        clearCheckoutHint()
        expect(readCheckoutHint('', 1001)).toBeUndefined()
        rememberCheckoutHint(id, 1000)
        expect(readCheckoutHint('', 1000 + 30 * 60 * 1000)).toBeUndefined()
        expect(sessionStorage.getItem('lef-checkout-return')).toBeNull()
    })

    it('ignores malformed storage and invalid UUIDs', () => {
        sessionStorage.setItem('lef-checkout-return', '{')
        expect(readCheckoutHint('')).toBeUndefined()
        rememberCheckoutHint('not-a-uuid')
        expect(sessionStorage.length).toBe(0)
    })
})
