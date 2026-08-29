import { Inject, Injectable, Logger } from '@nestjs/common'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentAdjustmentHandler } from './payment-adjustment.handler'
import { PaymentEvent } from './payment-provider'
import { PAYMENT_PURCHASE_STORE, PaymentPurchaseStore, PurchaseReferenceConflictError } from './payment-purchase.store'

@Injectable()
export class PaymentEventHandler {
    private readonly logger = new Logger(PaymentEventHandler.name)

    constructor(
        @Inject(PAYMENT_PURCHASE_STORE) private readonly purchases: PaymentPurchaseStore,
        private readonly credits: CreditsService,
        private readonly adjustmentHandler: PaymentAdjustmentHandler,
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
                const purchase = await this.purchases.recordPaid(correlation)
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
        this.logger.warn({
            message: 'Ignoring payment event for an unknown purchase',
            providerEventId: event.providerEventId,
            providerReference: event.providerReference,
        })
    }

    private logConflict(
        event: Exclude<PaymentEvent, { kind: 'ignored' }>,
        error: PurchaseReferenceConflictError,
    ): void {
        this.logger.error({
            message: 'Rejecting a payment event whose purchase is already bound to a different provider reference',
            providerEventId: event.providerEventId,
            providerReference: event.providerReference,
            purchaseId: error.purchaseId,
        })
    }
}
