import { Inject, Injectable } from '@nestjs/common'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import {
    PAYMENT_ADJUSTMENT_STORE,
    PaymentAdjustmentDirection,
    PaymentAdjustmentStore,
} from './payment-adjustment.store'
import { PaymentEvent } from './payment-provider'

type AdjustmentEvent = Extract<
    PaymentEvent,
    { kind: 'purchase_adjustment_debit' | 'purchase_adjustment_restore' }
>

@Injectable()
export class PaymentAdjustmentHandler {
    constructor(
        @Inject(PAYMENT_ADJUSTMENT_STORE) private readonly adjustments: PaymentAdjustmentStore,
        private readonly credits: CreditsService,
    ) {}

    async handle(event: AdjustmentEvent): Promise<boolean> {
        const direction =
            event.kind === 'purchase_adjustment_debit'
                ? PaymentAdjustmentDirection.DEBIT
                : PaymentAdjustmentDirection.RESTORE
        const claim = await this.adjustments.claim({
            providerEventId: event.providerEventId,
            providerReference: event.providerReference,
            providerAdjustmentId: event.providerAdjustmentId,
            direction,
            amountMinor: event.amountMinor,
            currency: event.currency,
        })
        if (!claim) return false
        if (claim.completed) return true

        const appliedCredits =
            claim.direction === PaymentAdjustmentDirection.DEBIT
                ? await this.credits.debitUpTo(
                      claim.organizationId,
                      claim.operationCredits,
                      claim.ledgerReference,
                  )
                : await this.credits.creditOnce(
                      claim.organizationId,
                      claim.operationCredits,
                      claim.ledgerReference,
                  )
        await this.adjustments.complete(claim.providerAdjustmentId, appliedCredits)
        return true
    }
}
