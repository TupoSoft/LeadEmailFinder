import { EventName } from '@paddle/paddle-node-sdk'
import {
    CheckoutInput,
    CheckoutResult,
    InvalidPaymentSignatureError,
    PaymentEvent,
    PaymentProvider,
} from '../../payment-provider'
import { PaddleClient } from './paddle-client'

export class PaddleCheckoutUrlMissingError extends Error {
    constructor(transactionId: string) {
        super(`Paddle transaction has no checkout URL: ${transactionId}`)
        this.name = PaddleCheckoutUrlMissingError.name
    }
}

export class PaddlePaymentProvider implements PaymentProvider {
    constructor(
        private readonly client: PaddleClient,
        private readonly webhookSecret: string,
    ) {}

    async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
        const transaction = await this.client.transactions.create({
            items: [{ priceId: input.pack.providerPriceId, quantity: 1 }],
            customData: {
                purchaseId: input.purchaseId,
                organizationId: input.organizationId,
            },
            checkout: { url: input.returnUrl },
        })
        const redirectUrl = transaction.checkout?.url

        if (!redirectUrl) {
            throw new PaddleCheckoutUrlMissingError(transaction.id)
        }

        return { providerReference: transaction.id, redirectUrl }
    }

    async parseEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent> {
        let event

        try {
            event = await this.client.webhooks.unmarshal(rawBody.toString('utf8'), this.webhookSecret, signature)
        } catch {
            throw new InvalidPaymentSignatureError()
        }

        switch (event.eventType) {
            case EventName.TransactionCompleted:
                return {
                    kind: 'purchase_paid',
                    providerEventId: event.eventId,
                    providerReference: event.data.id,
                    purchaseId: extractPurchaseId(event.data.customData),
                }
            case EventName.TransactionCanceled:
            case EventName.TransactionPastDue:
                return {
                    kind: 'purchase_failed',
                    providerEventId: event.eventId,
                    providerReference: event.data.id,
                    purchaseId: extractPurchaseId(event.data.customData),
                }
            case EventName.AdjustmentCreated:
            case EventName.AdjustmentUpdated:
                return mapAdjustmentEvent(event.eventId, event.data)
            default:
                return { kind: 'ignored', providerEventId: event.eventId }
        }
    }
}

interface PaddleAdjustmentData {
    id: string
    action: string
    status: string
    transactionId: string
    currencyCode: string
    totals: { subtotal: string }
}

function mapAdjustmentEvent(providerEventId: string, adjustment: PaddleAdjustmentData): PaymentEvent {
    if (adjustment.status !== 'approved') return { kind: 'ignored', providerEventId }

    const debitActions = new Set(['refund', 'credit', 'chargeback'])
    const restoreActions = new Set(['chargeback_reverse', 'credit_reverse'])
    if (!debitActions.has(adjustment.action) && !restoreActions.has(adjustment.action)) {
        return { kind: 'ignored', providerEventId }
    }

    const amountMinor = parseAdjustmentAmount(adjustment.totals.subtotal)
    if (!/^[A-Z]{3}$/.test(adjustment.currencyCode)) {
        throw new Error('Invalid Paddle adjustment currency')
    }

    return {
        kind: debitActions.has(adjustment.action) ? 'purchase_adjustment_debit' : 'purchase_adjustment_restore',
        providerEventId,
        providerReference: adjustment.transactionId,
        providerAdjustmentId: adjustment.id,
        amountMinor,
        currency: adjustment.currencyCode,
    }
}

function parseAdjustmentAmount(value: string): number {
    if (!/^\d+$/.test(value)) throw new Error('Invalid Paddle adjustment amount')

    const amount = Number(value)
    if (!Number.isSafeInteger(amount)) throw new Error('Invalid Paddle adjustment amount')
    return amount
}

// The signed event has already been verified by this point; customData is otherwise untyped provider input,
// so this purchase ID is a correlation fallback only, never a source of organization or credit amounts.
function extractPurchaseId(customData: unknown): string | undefined {
    if (customData === null || typeof customData !== 'object') return undefined

    const purchaseId = (customData as Record<string, unknown>)['purchaseId']
    return typeof purchaseId === 'string' && purchaseId.length > 0 ? purchaseId : undefined
}
