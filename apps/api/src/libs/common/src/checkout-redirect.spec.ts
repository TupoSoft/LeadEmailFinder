import { resolveCheckoutAllowedOrigins, validateCheckoutRedirect } from './checkout-redirect'

describe('shared checkout URL policy', () => {
    const origins = [
        'https://checkout.paddle.com',
        'https://sandbox-checkout.paddle.com',
        'http://localhost:53000',
        'https://xn--bcher-kva.example',
    ]

    it.each([
        [
            'https://CHECKOUT.PADDLE.COM:443/pay?transaction=example',
            'https://checkout.paddle.com/pay?transaction=example',
        ],
        ['https://sandbox-checkout.paddle.com/pay', 'https://sandbox-checkout.paddle.com/pay'],
        [
            'http://localhost:53000/billing/complete?purchaseId=example',
            'http://localhost:53000/billing/complete?purchaseId=example',
        ],
        ['https://bücher.example/pay', 'https://xn--bcher-kva.example/pay'],
    ])('normalizes an explicitly allowed URL %s', (raw, expected) => {
        expect(validateCheckoutRedirect(raw, origins)).toBe(expected)
    })

    it.each([
        '//checkout.paddle.com/pay',
        'javascript:alert(1)',
        '/billing/complete',
        'not a URL',
        'http://checkout.paddle.com/pay',
        'https://checkout.paddle.com.evil.example/pay',
        'https://evil.example/?next=https://checkout.paddle.com',
        'https://checkout.paddle.com:444/pay',
        'https://name:secret@checkout.paddle.com/pay',
        'https://@checkout.paddle.com/pay',
        'https://checkout.paddle.com/pay#fragment',
        'https://checkout.paddle.com/pay#',
        ' https://checkout.paddle.com/pay',
        'https://checkout.paddle.com/\nsecret',
        'https://checkout.paddle.com\\@evil.example/pay',
        'https://checkоut.paddle.com/pay',
    ])('rejects unsafe URLs without disclosing their input', raw => {
        expect(() => validateCheckoutRedirect(raw, origins)).toThrow('Checkout URL is not allowed')
    })

    it('uses only the stub return origin, ignoring configured external origins', () => {
        const result = resolveCheckoutAllowedOrigins({
            provider: 'stub',
            checkoutUrl: 'http://localhost:53000/billing/complete',
            allowedOrigins: 'https://evil.example',
        })
        expect(result).toEqual(['http://localhost:53000'])
        expect(Object.isFrozen(result)).toBe(true)
    })

    it.each(['http://127.0.0.1:53000/complete', 'http://[::1]:53000/complete', 'https://localhost/complete'])(
        'accepts explicit loopback development %s',
        checkoutUrl => {
            expect(resolveCheckoutAllowedOrigins({ provider: 'stub', checkoutUrl })).toEqual([
                new URL(checkoutUrl).origin,
            ])
        },
    )

    it.each(['https://example.com/complete', 'http://localhost.evil.example/complete'])(
        'rejects nonloopback stub return %s',
        checkoutUrl => {
            expect(() => resolveCheckoutAllowedOrigins({ provider: 'stub', checkoutUrl })).toThrow()
        },
    )

    it('normalizes, deduplicates, and orders explicit origins', () => {
        expect(
            resolveCheckoutAllowedOrigins({
                provider: 'paddle',
                checkoutUrl: '',
                allowedOrigins: 'https://CHECKOUT.PADDLE.COM:443/, https://bücher.example, https://checkout.paddle.com',
            }),
        ).toEqual(['https://checkout.paddle.com', 'https://xn--bcher-kva.example'])
    })

    it.each([
        undefined,
        '',
        ' ',
        'https://checkout.paddle.com,',
        'http://example.com',
        'https://example.com/path',
        'https://example.com/?',
        'https://example.com/#',
        'https://user:secret@example.com',
        '//example.com',
    ])('fails closed on missing or malformed Paddle origins', allowedOrigins => {
        expect(() => resolveCheckoutAllowedOrigins({ provider: 'paddle', checkoutUrl: '', allowedOrigins })).toThrow()
    })
})
