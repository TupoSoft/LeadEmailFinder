import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentEvent } from '../domain/payment-event'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import { PaymentEventLogger } from './ports/payment-event-logger'
import { PaymentPurchaseStore, PurchaseReferenceConflictError } from './ports/payment-purchase-store'

export class PaymentEventHandler {
    constructor(
        private readonly purchases: PaymentPurchaseStore,
        private readonly credits: CreditsService,
        private readonly adjustmentHandler: PaymentAdjustmentHandler,
        private readonly log: PaymentEventLogger,
    ) {}

    async handle(event: PaymentEvent): Promise<void> {
        if (event.kind === 'ignored') return

        if (event.kind === 'purchase_adjustment_debit' || event.kind === 'purchase_adjustment_restore') {
            if (!(await this.adjustmentHandler.handle(event))) this.logUnknown(event)
            return
        }

        const correlation = { providerReference: event.providerReference, purchaseId: event.purchaseId }

        try {
            if (event.kind === 'purchase_paid') {
                const purchase = await this.purchases.recordPaid({
                    ...correlation,
                    providerTotalMinor: event.providerTotalMinor,
                    currency: event.currency,
                })
                if (!purchase) return this.logUnknown(event)

                await this.credits.credit(purchase.organizationId, purchase.credits, purchase.id)
                await this.purchases.recordCreditsGranted(purchase.id)
                return
            }

            if (!(await this.purchases.recordFailed(correlation))) this.logUnknown(event)
        } catch (error) {
            if (error instanceof PurchaseReferenceConflictError) this.logConflict(event, error)
            throw error
        }
    }

    private logUnknown(event: Exclude<PaymentEvent, { kind: 'ignored' }>): void {
        this.log.warnUnknownEvent(event.providerEventId, event.providerReference)
    }

    private logConflict(
        event: Exclude<PaymentEvent, { kind: 'ignored' }>,
        error: PurchaseReferenceConflictError,
    ): void {
        this.log.errorConflict(event.providerEventId, event.providerReference, error.purchaseId)
    }
}
