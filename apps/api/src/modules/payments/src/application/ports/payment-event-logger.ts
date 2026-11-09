export const PAYMENT_EVENT_LOGGER = Symbol('PAYMENT_EVENT_LOGGER')

export interface PaymentEventLogger {
    warnUnknownEvent(providerEventId: string, providerReference: string): void
    errorConflict(providerEventId: string, providerReference: string, purchaseId: string): void
}
