import { PaymentEvent, PaymentProvider } from './payment-provider'

interface PaymentProviderContractOptions {
    createProvider(): PaymentProvider
    serializeEvent(event: PaymentEvent): Buffer
    sign(rawBody: Buffer): string
}

export function paymentProviderContract(name: string, options: PaymentProviderContractOptions): void {
    describe(`${name} payment provider contract`, () => {
        let provider: PaymentProvider

        beforeEach(() => {
            provider = options.createProvider()
        })

        it.each<PaymentEvent>([
            {
                kind: 'purchase_paid',
                providerEventId: 'event-paid',
                providerReference: 'provider-purchase',
                providerTotalMinor: 500,
                currency: 'USD',
            },
            { kind: 'purchase_failed', providerEventId: 'event-failed', providerReference: 'provider-purchase' },
            {
                kind: 'purchase_paid',
                providerEventId: 'event-paid-with-purchase-id',
                providerReference: 'provider-purchase',
                purchaseId: '20000000-0000-4000-8000-000000000001',
                providerTotalMinor: 500,
                currency: 'USD',
            },
            {
                kind: 'purchase_adjustment_debit',
                providerEventId: 'event-adjustment-debit',
                providerReference: 'provider-purchase',
                providerAdjustmentId: 'adjustment-debit',
                amountMinor: 250,
                isFull: false,
                currency: 'USD',
            },
            {
                kind: 'purchase_adjustment_restore',
                providerEventId: 'event-adjustment-restore',
                providerReference: 'provider-purchase',
                providerAdjustmentId: 'adjustment-restore',
                amountMinor: 250,
                isFull: true,
                currency: 'USD',
            },
        ])('parses a valid $kind event', async expected => {
            const rawBody = options.serializeEvent(expected)

            await expect(provider.parseEvent(rawBody, options.sign(rawBody))).resolves.toEqual(expected)
        })

        it('rejects a body changed after signing', async () => {
            const signedBody = options.serializeEvent({
                kind: 'purchase_paid',
                providerEventId: 'event-paid',
                providerReference: 'provider-purchase',
                providerTotalMinor: 500,
                currency: 'USD',
            })
            const tamperedBody = options.serializeEvent({
                kind: 'purchase_paid',
                providerEventId: 'event-paid',
                providerReference: 'different-purchase',
                providerTotalMinor: 500,
                currency: 'USD',
            })

            await expect(provider.parseEvent(tamperedBody, options.sign(signedBody))).rejects.toMatchObject({
                name: 'InvalidPaymentSignatureError',
            })
        })

        it('rejects the wrong signature', async () => {
            const rawBody = options.serializeEvent({
                kind: 'purchase_paid',
                providerEventId: 'event-paid',
                providerReference: 'provider-purchase',
                providerTotalMinor: 500,
                currency: 'USD',
            })

            await expect(provider.parseEvent(rawBody, 'wrong-signature')).rejects.toMatchObject({
                name: 'InvalidPaymentSignatureError',
            })
        })

        it('maps an unrecognized event kind to ignored', async () => {
            const rawBody = options.serializeEvent({ kind: 'ignored', providerEventId: 'event-ignored' })

            await expect(provider.parseEvent(rawBody, options.sign(rawBody))).resolves.toEqual({
                kind: 'ignored',
                providerEventId: 'event-ignored',
            })
        })
    })
}
