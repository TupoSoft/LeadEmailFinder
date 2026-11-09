import { resolveCheckoutAllowedOrigins } from '@tuposoft/lead-email-finder/common/checkout-redirect'
import { ConfiguredCheckoutRedirectPolicy } from './configured-checkout-redirect-policy'

describe('ConfiguredCheckoutRedirectPolicy', () => {
    const policy = new ConfiguredCheckoutRedirectPolicy(
        resolveCheckoutAllowedOrigins({
            provider: 'paddle',
            checkoutUrl: 'https://pay.example.test/checkout',
            allowedOrigins:
                'https://PAY.EXAMPLE.TEST:443,https://sandbox-checkout.paddle.com,https://checkout.paddle.com,https://bücher.example,http://localhost:53000',
        }),
    )

    it.each([
        ['https://PAY.EXAMPLE.TEST:443/pay?id=123', 'https://pay.example.test/pay?id=123'],
        ['https://sandbox-checkout.paddle.com/checkout', 'https://sandbox-checkout.paddle.com/checkout'],
        ['https://checkout.paddle.com/checkout', 'https://checkout.paddle.com/checkout'],
        ['https://bücher.example/pay', 'https://xn--bcher-kva.example/pay'],
        ['https://xn--bcher-kva.example/pay', 'https://xn--bcher-kva.example/pay'],
        ['http://localhost:53000/billing/complete', 'http://localhost:53000/billing/complete'],
    ])('normalizes the allowed destination %s', (raw, expected) => {
        expect(policy.assertAllowed(raw)).toBe(expected)
    })

    it.each([
        'javascript:alert(1)',
        '//pay.example.test/pay',
        '/pay',
        'https://user:secret@pay.example.test/pay',
        'https://@pay.example.test/pay',
        'http://pay.example.test/pay',
        'https://pay.example.test/pay#fragment',
        'https://pay.example.test/pay#',
        'https://pay.example.test.attacker.test/pay',
        'https://attacker.test/?next=https://pay.example.test',
        'https://pay.example.test:444/pay',
        'http://localhost.attacker.test:53000/pay',
    ])('rejects an unsafe destination without retaining its value: %s', raw => {
        try {
            policy.assertAllowed(raw)
            throw new Error('Expected policy rejection')
        } catch (error) {
            expect((error as Error).message).toBe('Checkout URL is not allowed')
            expect((error as Error).cause).toBeUndefined()
        }
    })

    it('takes a defensive copy of the configured origin list', () => {
        const origins = ['https://pay.example.test']
        const snapshot = new ConfiguredCheckoutRedirectPolicy(origins)
        origins.push('https://attacker.test')
        expect(() => snapshot.assertAllowed('https://attacker.test/pay')).toThrow('Checkout URL is not allowed')
    })
})
