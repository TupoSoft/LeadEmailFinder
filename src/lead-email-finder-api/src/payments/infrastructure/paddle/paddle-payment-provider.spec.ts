import { createHmac } from 'node:crypto'
import { Environment, Paddle } from '@paddle/paddle-node-sdk'
import { CreditPack } from '../../credit-pack-catalog'
import { PaymentEvent } from '../../payment-provider'
import { paymentProviderContract } from '../../payment-provider.contract'
import { PaddleClient } from './paddle-client'
import { PaddleCheckoutUrlMissingError, PaddlePaymentProvider } from './paddle-payment-provider'

const webhookSecret = 'paddle-contract-test-secret'

function createSdkProvider(): PaddlePaymentProvider {
    const paddle = new Paddle('paddle-test-api-key', { environment: Environment.sandbox })
    return new PaddlePaymentProvider(paddle, webhookSecret)
}

function serializeEvent(event: PaymentEvent): Buffer {
    const eventType =
        event.kind === 'purchase_paid'
            ? 'transaction.completed'
            : event.kind === 'purchase_failed'
              ? 'transaction.canceled'
              : 'test.unrecognized'
    const providerReference = event.kind === 'ignored' ? 'ignored-reference' : event.providerReference

    const purchaseId = event.kind === 'ignored' ? undefined : event.purchaseId

    return Buffer.from(
        JSON.stringify({
            event_id: event.providerEventId,
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            notification_id: `notification-${event.providerEventId}`,
            data: {
                id: providerReference,
                items: [],
                payments: [],
                custom_data: purchaseId === undefined ? null : { purchaseId },
            },
        }),
    )
}

function sign(rawBody: Buffer): string {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const digest = createHmac('sha256', webhookSecret)
        .update(`${timestamp}:${rawBody.toString('utf8')}`)
        .digest('hex')
    return `ts=${timestamp};h1=${digest}`
}

paymentProviderContract('PaddlePaymentProvider', {
    createProvider: createSdkProvider,
    serializeEvent,
    sign,
})

describe('PaddlePaymentProvider', () => {
    const pack: CreditPack = {
        id: 'starter',
        credits: 100,
        amountMinor: 500,
        currency: 'USD',
        providerPriceId: 'pri_starter',
    }

    it('creates a hosted checkout from the configured pack price', async () => {
        const create = jest.fn().mockResolvedValue({
            id: 'txn_purchase',
            checkout: { url: 'https://sandbox-checkout.paddle.com/pay/txn_purchase' },
        })
        const provider = new PaddlePaymentProvider(
            { transactions: { create }, webhooks: { unmarshal: jest.fn() } } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(
            provider.createCheckout({
                purchaseId: 'purchase-id',
                organizationId: 'organization-id',
                pack,
                returnUrl: 'http://localhost:53000/billing/complete',
            }),
        ).resolves.toEqual({
            providerReference: 'txn_purchase',
            redirectUrl: 'https://sandbox-checkout.paddle.com/pay/txn_purchase',
        })
        expect(create).toHaveBeenCalledWith({
            items: [{ priceId: 'pri_starter', quantity: 1 }],
            customData: { purchaseId: 'purchase-id', organizationId: 'organization-id' },
            checkout: { url: 'http://localhost:53000/billing/complete' },
        })
    })

    it('rejects a transaction without a checkout URL', async () => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn().mockResolvedValue({ id: 'txn_without_checkout', checkout: null }) },
                webhooks: { unmarshal: jest.fn() },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(
            provider.createCheckout({
                purchaseId: 'purchase-id',
                organizationId: 'organization-id',
                pack,
                returnUrl: 'http://localhost:53000/billing/complete',
            }),
        ).rejects.toBeInstanceOf(PaddleCheckoutUrlMissingError)
    })

    it('ignores adjustment events reserved for refund handling', async () => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-adjustment',
                        eventType: 'adjustment.created',
                        data: { id: 'adjustment-id' },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual({
            kind: 'ignored',
            providerEventId: 'event-adjustment',
        })
    })
})
