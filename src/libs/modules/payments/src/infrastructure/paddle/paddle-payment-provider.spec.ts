import { createHmac } from 'node:crypto'
import { Environment, Paddle } from '@paddle/paddle-node-sdk'
import { CreditPack } from '../../domain/credit-pack'
import { PaymentEvent } from '../../domain/payment-event'
import { paymentProviderContract } from '../payment-provider.contract'
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
                    type: event.isFull ? 'full' : 'partial',
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
                currency_code: event.kind === 'purchase_paid' ? event.currency : 'USD',
                items: [],
                payments: [],
                custom_data: purchaseId === undefined ? null : { purchaseId },
                details:
                    event.kind === 'purchase_paid'
                        ? {
                              tax_rates_used: [],
                              line_items: [],
                              totals: {
                                  subtotal: String(event.providerTotalMinor),
                                  discount: '0',
                                  tax: '0',
                                  total: String(event.providerTotalMinor),
                                  credit: '0',
                                  credit_to_balance: '0',
                                  balance: String(event.providerTotalMinor),
                                  grand_total: String(event.providerTotalMinor),
                                  grand_total_tax: '0',
                                  fee: null,
                                  earnings: null,
                                  currency_code: event.currency,
                              },
                              adjusted_totals: null,
                              payout_totals: null,
                              adjusted_payout_totals: null,
                          }
                        : null,
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

    it('maps the completed transaction grand total as the adjustment basis', async () => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-paid',
                        eventType: 'transaction.completed',
                        data: {
                            id: 'transaction-id',
                            customData: { purchaseId: 'purchase-id' },
                            currencyCode: 'USD',
                            details: {
                                totals: {
                                    subtotal: '407',
                                    tax: '93',
                                    total: '500',
                                    grandTotal: '500',
                                    currencyCode: 'USD',
                                },
                            },
                        },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual({
            kind: 'purchase_paid',
            providerEventId: 'event-paid',
            providerReference: 'transaction-id',
            purchaseId: 'purchase-id',
            providerTotalMinor: 500,
            currency: 'USD',
        })
    })

    it.each([
        [{ totals: null }, 'USD', 'Paddle completed transaction has no totals'],
        [{ totals: { grandTotal: 'not-money', currencyCode: 'USD' } }, 'USD', 'Invalid Paddle transaction total'],
        [{ totals: { grandTotal: '500', currencyCode: 'EUR' } }, 'USD', 'Paddle transaction currency mismatch'],
    ])('rejects malformed completed transaction accounting fields', async (details, currencyCode, message) => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-paid',
                        eventType: 'transaction.completed',
                        data: { id: 'transaction-id', customData: null, currencyCode, details },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).rejects.toThrow(message)
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
                            type: 'partial',
                            status,
                            transactionId: 'transaction-id',
                            currencyCode: 'USD',
                            totals: { subtotal: '250', tax: '50', total: '300', currencyCode: 'USD' },
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
                      amountMinor: 300,
                      isFull: false,
                      currency: 'USD',
                  }
                : { kind: 'ignored', providerEventId: 'event-adjustment' }

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual(expected)
    })

    it('maps a tax-inclusive full refund to its gross amount and full scope', async () => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-full-refund',
                        eventType: 'adjustment.updated',
                        data: {
                            id: 'adjustment-id',
                            action: 'refund',
                            type: 'full',
                            status: 'approved',
                            transactionId: 'transaction-id',
                            currencyCode: 'USD',
                            totals: { subtotal: '407', tax: '93', total: '500', currencyCode: 'USD' },
                        },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual({
            kind: 'purchase_adjustment_debit',
            providerEventId: 'event-full-refund',
            providerReference: 'transaction-id',
            providerAdjustmentId: 'adjustment-id',
            amountMinor: 500,
            isFull: true,
            currency: 'USD',
        })
    })

    it('treats a nullable adjustment type as Paddle\'s default partial scope', async () => {
        const provider = new PaddlePaymentProvider(
            {
                transactions: { create: jest.fn() },
                webhooks: {
                    unmarshal: jest.fn().mockResolvedValue({
                        eventId: 'event-default-partial-refund',
                        eventType: 'adjustment.created',
                        data: {
                            id: 'adjustment-id',
                            action: 'refund',
                            type: null,
                            status: 'approved',
                            transactionId: 'transaction-id',
                            currencyCode: 'USD',
                            totals: { subtotal: '407', tax: '93', total: '500', currencyCode: 'USD' },
                        },
                    }),
                },
            } as unknown as PaddleClient,
            webhookSecret,
        )

        await expect(provider.parseEvent(Buffer.from('{}'), 'signature')).resolves.toEqual({
            kind: 'purchase_adjustment_debit',
            providerEventId: 'event-default-partial-refund',
            providerReference: 'transaction-id',
            providerAdjustmentId: 'adjustment-id',
            amountMinor: 500,
            isFull: false,
            currency: 'USD',
        })
    })

    it.each([
        [
            { subtotal: '250', tax: '0', total: 'not-money', currencyCode: 'USD' },
            'partial',
            'USD',
            'Invalid Paddle adjustment amount',
        ],
        [
            { subtotal: '250', tax: '0', total: '250', currencyCode: 'USD' },
            'unknown',
            'USD',
            'Invalid Paddle adjustment type',
        ],
        [
            { subtotal: '250', tax: '0', total: '250', currencyCode: 'usd' },
            'partial',
            'usd',
            'Invalid Paddle adjustment currency',
        ],
        [
            { subtotal: '250', tax: '0', total: '250', currencyCode: 'EUR' },
            'partial',
            'USD',
            'Paddle adjustment currency mismatch',
        ],
        [
            { subtotal: '250', tax: '50', total: '250', currencyCode: 'USD' },
            'partial',
            'USD',
            'Invalid Paddle adjustment totals',
        ],
    ])('rejects malformed approved adjustment accounting fields', async (totals, type, currencyCode, message) => {
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
                            type,
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
