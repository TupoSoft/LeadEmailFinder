import type { CreditPack } from './credit-pack-catalog'

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

export interface CheckoutInput {
    purchaseId: string
    organizationId: string
    pack: CreditPack
    returnUrl: string
}

export interface CheckoutResult {
    providerReference: string
    redirectUrl: string
}

export interface PaymentAdjustmentEvent {
    providerEventId: string
    providerReference: string
    providerAdjustmentId: string
    amountMinor: number
    currency: string
}

export type PaymentEvent =
    | {
          kind: 'purchase_paid' | 'purchase_failed'
          providerEventId: string
          providerReference: string
          purchaseId?: string
      }
    | (PaymentAdjustmentEvent & { kind: 'purchase_adjustment_debit' })
    | (PaymentAdjustmentEvent & { kind: 'purchase_adjustment_restore' })
    | {
          kind: 'ignored'
          providerEventId: string
      }

export interface PaymentProvider {
    createCheckout(input: CheckoutInput): Promise<CheckoutResult>
    parseEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent>
}

export class InvalidPaymentSignatureError extends Error {
    constructor() {
        super('Invalid payment event signature')
        this.name = InvalidPaymentSignatureError.name
    }
}
