import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'

/**
 * Confirms one execution's already-persisted capture-or-release intention against credits, using the execution
 * ID as the stable opaque reference on every attempt. Mirrors `PaymentAdjustmentHandler`'s
 * claim-then-call-credits-then-complete shape: replaying an already-confirmed intention is a no-op, and
 * `CreditReservationService.capture()`/`release()` are themselves replay-safe, so a crash between a successful
 * credit call and this confirmation can never cause a second debit on retry.
 */
export class VerificationSettlementService {
    constructor(
        private readonly settlements: VerificationSettlementStore,
        private readonly credits: CreditReservationService,
    ) {}

    async settle(executionId: string, organizationId: string): Promise<void> {
        const intention = await this.settlements.findIntention(executionId, organizationId)
        if (!intention) return
        if (intention.state === 'confirmed') return

        if (intention.decision === 'capture') {
            await this.credits.capture(organizationId, executionId)
        } else {
            await this.credits.release(organizationId, executionId)
        }

        await this.settlements.confirmSettlement(executionId, organizationId)
    }
}
