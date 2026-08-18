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

export type PaymentEvent =
    | {
          kind: 'purchase_paid' | 'purchase_failed'
          providerEventId: string
          providerReference: string
      }
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
