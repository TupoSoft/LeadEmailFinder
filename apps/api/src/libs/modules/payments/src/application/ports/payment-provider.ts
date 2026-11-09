import { CheckoutInput, CheckoutResult, PaymentEvent } from '../../domain/payment-event'

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

export interface PaymentProvider {
    createCheckout(input: CheckoutInput): Promise<CheckoutResult>
    parseEvent(rawBody: Buffer, signature: string): Promise<PaymentEvent>
}
