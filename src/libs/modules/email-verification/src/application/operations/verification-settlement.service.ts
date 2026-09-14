import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailAdministrationService } from '../email-administration.service'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'

/**
 * Confirms one execution's already-persisted capture-or-release intention against credits, using the execution
 * ID as the stable opaque reference on every attempt. Mirrors `PaymentAdjustmentHandler`'s
 * claim-then-call-credits-then-complete shape: replaying an already-confirmed intention is a no-op, and
 * `CreditReservationService.capture()`/`release()` are themselves replay-safe, so a crash between a successful
 * credit call and this confirmation can never cause a second debit on retry. Also advances the email cache's
 * `lastVerificationId` link once settlement is confirmed — the one place in the new durable stack that mirrors
 * `EmailVerificationOrchestrator`'s old unconditional cache-finalize step, gated at exactly the point where the
 * result becomes visible.
 */
export class VerificationSettlementService {
    constructor(
        private readonly settlements: VerificationSettlementStore,
        private readonly credits: CreditReservationService,
        private readonly emailAdministration: EmailAdministrationService,
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

        const { normalizedAddress, exists } = await this.settlements.confirmSettlement(executionId, organizationId)
        await this.emailAdministration.upsertEmail(organizationId, normalizedAddress, {
            exists,
            lastVerificationId: intention.resultId,
        })
    }
}
