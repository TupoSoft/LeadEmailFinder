import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { PaymentAdjustmentDirection } from '../domain/payment-adjustment-direction'
import { PaymentEvent } from '../domain/payment-event'
import { PaymentAdjustmentStore } from './ports/payment-adjustment-store'

type AdjustmentEvent = Extract<PaymentEvent, { kind: 'purchase_adjustment_debit' | 'purchase_adjustment_restore' }>

export class PaymentAdjustmentHandler {
    constructor(
        private readonly adjustments: PaymentAdjustmentStore,
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
            isFull: event.isFull,
            currency: event.currency,
        })
        if (!claim) return false
        if (claim.completed) return true

        const appliedCredits =
            claim.direction === PaymentAdjustmentDirection.DEBIT
                ? await this.credits.debitUpTo(claim.organizationId, claim.operationCredits, claim.ledgerReference)
                : await this.credits.creditOnce(claim.organizationId, claim.operationCredits, claim.ledgerReference)
        await this.adjustments.complete(claim.providerAdjustmentId, appliedCredits)
        return true
    }
}
