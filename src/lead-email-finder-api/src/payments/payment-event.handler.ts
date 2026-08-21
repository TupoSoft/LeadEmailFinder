import { Inject, Injectable, Logger } from '@nestjs/common'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentEvent } from './payment-provider'
import { PAYMENT_PURCHASE_STORE, PaymentPurchaseStore } from './payment-purchase.store'

@Injectable()
export class PaymentEventHandler {
    private readonly logger = new Logger(PaymentEventHandler.name)

    constructor(
        @Inject(PAYMENT_PURCHASE_STORE) private readonly purchases: PaymentPurchaseStore,
        private readonly credits: CreditsService,
    ) {}

    async handle(event: PaymentEvent): Promise<void> {
        if (event.kind === 'ignored') return

        if (event.kind === 'purchase_paid') {
            const purchase = await this.purchases.recordPaid(event.providerReference)
            if (!purchase) return this.logUnknown(event)

            await this.credits.credit(purchase.organizationId, purchase.credits, purchase.id)
            return
        }

        if (!(await this.purchases.recordFailed(event.providerReference))) this.logUnknown(event)
    }

    private logUnknown(event: Exclude<PaymentEvent, { kind: 'ignored' }>): void {
        this.logger.warn({
            message: 'Ignoring payment event for an unknown purchase',
            providerEventId: event.providerEventId,
            providerReference: event.providerReference,
        })
    }
}
