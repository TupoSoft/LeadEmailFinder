import { PaymentEvent, PaymentProvider } from './payment-provider'

interface PaymentProviderContractOptions {
    createProvider(): PaymentProvider
    sign(rawBody: Buffer): string
}

export function paymentProviderContract(name: string, options: PaymentProviderContractOptions): void {
    describe(`${name} payment provider contract`, () => {
        let provider: PaymentProvider

        beforeEach(() => {
            provider = options.createProvider()
        })

        it.each<PaymentEvent>([
            { kind: 'purchase_paid', providerEventId: 'event-paid', providerReference: 'provider-purchase' },
            { kind: 'purchase_failed', providerEventId: 'event-failed', providerReference: 'provider-purchase' },
        ])('parses a valid $kind event', async expected => {
            const rawBody = Buffer.from(JSON.stringify(expected))

            await expect(provider.parseEvent(rawBody, options.sign(rawBody))).resolves.toEqual(expected)
        })

        it('rejects a body changed after signing', async () => {
            const signedBody = Buffer.from(
                JSON.stringify({
                    kind: 'purchase_paid',
                    providerEventId: 'event-paid',
                    providerReference: 'provider-purchase',
                }),
            )
            const tamperedBody = Buffer.from(
                JSON.stringify({
                    kind: 'purchase_paid',
                    providerEventId: 'event-paid',
                    providerReference: 'different-purchase',
                }),
            )

            await expect(provider.parseEvent(tamperedBody, options.sign(signedBody))).rejects.toMatchObject({
                name: 'InvalidPaymentSignatureError',
            })
        })

        it('rejects the wrong signature', async () => {
            const rawBody = Buffer.from(
                JSON.stringify({
                    kind: 'purchase_paid',
                    providerEventId: 'event-paid',
                    providerReference: 'provider-purchase',
                }),
            )

            await expect(provider.parseEvent(rawBody, 'wrong-signature')).rejects.toMatchObject({
                name: 'InvalidPaymentSignatureError',
            })
        })

        it('maps an unrecognized event kind to ignored', async () => {
            const rawBody = Buffer.from(
                JSON.stringify({ kind: 'subscription_created', providerEventId: 'event-ignored' }),
            )

            await expect(provider.parseEvent(rawBody, options.sign(rawBody))).resolves.toEqual({
                kind: 'ignored',
                providerEventId: 'event-ignored',
            })
        })
    })
}
