import { createHmac } from 'node:crypto'
import { CreditPack } from '../domain/credit-pack'
import { paymentProviderContract } from './payment-provider.contract'
import { StubPaymentProvider } from './stub-payment-provider'

const webhookSecret = 'contract-test-secret'

function createProvider(): StubPaymentProvider {
    return new StubPaymentProvider(webhookSecret)
}

function sign(rawBody: Buffer): string {
    return createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
}

paymentProviderContract('StubPaymentProvider', {
    createProvider,
    serializeEvent: event => Buffer.from(JSON.stringify(event)),
    sign,
})

describe('StubPaymentProvider', () => {
    it('creates a deterministic local checkout', async () => {
        const pack: CreditPack = {
            id: 'starter',
            credits: 100,
            amountMinor: 500,
            currency: 'USD',
            providerPriceId: 'price_starter',
        }

        await expect(
            createProvider().createCheckout({
                purchaseId: 'purchase-id',
                organizationId: 'organization-id',
                pack,
                returnUrl: 'http://localhost:53000/billing/complete?providerReference=legacy&status=paid',
            }),
        ).resolves.toEqual({
            providerReference: 'stub_purchase-id',
            redirectUrl: 'http://localhost:53000/billing/complete?purchaseId=purchase-id',
        })
    })

    it.each([
        { override: { amountMinor: -1, currency: 'USD' }, description: 'negative amount' },
        { override: { amountMinor: 100.5, currency: 'USD' }, description: 'fractional amount' },
        { override: { amountMinor: 100, currency: 'usd' }, description: 'malformed currency' },
        { override: { amountMinor: 100, currency: 'USD', isFull: 'yes' }, description: 'non-boolean scope' },
    ])('rejects a signed adjustment with a $description', async ({ override }) => {
        const payload = Buffer.from(
            JSON.stringify({
                kind: 'purchase_adjustment_debit',
                providerEventId: 'event-id',
                providerReference: 'purchase-reference',
                providerAdjustmentId: 'adjustment-id',
                isFull: false,
                ...override,
            }),
        )

        await expect(createProvider().parseEvent(payload, sign(payload))).rejects.toThrow(
            'Invalid stub payment adjustment event',
        )
    })

    it.each([
        { providerTotalMinor: 0, currency: 'USD', description: 'zero provider total' },
        { providerTotalMinor: 500.5, currency: 'USD', description: 'fractional provider total' },
        { providerTotalMinor: 500, currency: 'usd', description: 'malformed currency' },
    ])('rejects a signed paid event with a $description', async invalid => {
        const payload = Buffer.from(
            JSON.stringify({
                kind: 'purchase_paid',
                providerEventId: 'event-id',
                providerReference: 'purchase-reference',
                ...invalid,
            }),
        )

        await expect(createProvider().parseEvent(payload, sign(payload))).rejects.toThrow('Invalid stub paid event')
    })
})
