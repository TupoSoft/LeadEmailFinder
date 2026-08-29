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
    if (event.kind === 'purchase_adjustment_debit' || event.kind === 'purchase_adjustment_restore') {
        return Buffer.from(
            JSON.stringify({
                event_id: event.providerEventId,
                event_type: 'adjustment.created',
                occurred_at: new Date().toISOString(),
                notification_id: `notification-${event.providerEventId}`,
                data: {
                    id: event.providerAdjustmentId,
                    action: event.kind === 'purchase_adjustment_debit' ? 'refund' : 'credit_reverse',
                    type: 'partial',
                    transaction_id: event.providerReference,
                    subscription_id: null,
                    customer_id: 'customer-id',
                    reason: 'contract test',
                    credit_applied_to_balance: false,
                    currency_code: event.currency,
                    status: 'approved',
                    items: [],
                    totals: {
                        subtotal: String(event.amountMinor),
                        tax: '0',
                        total: String(event.amountMinor),
                        fee: '0',
                        earnings: String(event.amountMinor),
                        currency_code: event.currency,
                        retained_fee: '0',
                    },
                    payout_totals: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            }),
        )
    }

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

    const adjustmentActions = [
        'refund',
        'credit',
        'chargeback',
        'chargeback_reverse',
        'credit_reverse',
        'chargeback_warning',
        'chargeback_warning_reverse',
    ] as const
    const adjustmentStatuses = ['pending_approval', 'approved', 'rejected', 'reversed'] as const
    const adjustmentEventTypes = ['adjustment.created', 'adjustment.updated'] as const

    it.each(
        adjustmentEventTypes.flatMap(eventType =>
            adjustmentActions.flatMap(action =>
                adjustmentStatuses.map(status => ({ eventType, action, status })),
            ),
        ),
    )('maps $eventType $action/$status to the accounting contract', async ({ eventType, action, status }) => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-adjustment',
                        eventType,
                        data: {
                            id: 'adjustment-id',
                            action,
                            status,
                            transactionId: 'transaction-id',
                            currencyCode: 'USD',
                            totals: { subtotal: '250', total: '300' },
                        },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        const debit = status === 'approved' && ['refund', 'credit', 'chargeback'].includes(action)
        const restore = status === 'approved' && ['chargeback_reverse', 'credit_reverse'].includes(action)
        const expected: PaymentEvent =
            debit || restore
                ? {
                      kind: debit ? 'purchase_adjustment_debit' : 'purchase_adjustment_restore',
                      providerEventId: 'event-adjustment',
                      providerReference: 'transaction-id',
                      providerAdjustmentId: 'adjustment-id',
                      amountMinor: 250,
                      currency: 'USD',
                  }
                : { kind: 'ignored', providerEventId: 'event-adjustment' }

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual(expected)
    })

    it.each([
        [{ subtotal: 'not-money' }, 'USD', 'Invalid Paddle adjustment amount'],
        [{ subtotal: '250' }, 'usd', 'Invalid Paddle adjustment currency'],
    ])('rejects malformed approved adjustment accounting fields', async (totals, currencyCode, message) => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-adjustment',
                        eventType: 'adjustment.created',
                        data: {
                            id: 'adjustment-id',
                            action: 'refund',
                            status: 'approved',
                            transactionId: 'transaction-id',
                            currencyCode,
                            totals,
                        },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).rejects.toThrow(message)
    })
})
