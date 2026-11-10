import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailAdministrationService } from '../email-administration.service'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'

/**
 * Confirms one execution's already-persisted capture-or-release intention against credits, using the execution
 * ID as the stable opaque reference on every attempt. Mirrors `PaymentAdjustmentHandler`'s
 * claim-then-call-credits-then-complete shape. Credit capture/release is replay-safe, so a crash between the
 * credit call and confirmation cannot cause a second debit. Replaying a confirmed intention also repairs
 * its email-cache link if the process stopped after confirmation but before cache publication.
 */
export class VerificationSettlementService {
    constructor(
        private readonly settlements: VerificationSettlementStore,
        private readonly credits: CreditReservationService,
        private readonly emailAdministration: EmailAdministrationService,
    ) {}

    async settle(executionId: string, organizationId: string): Promise<void> {
        const intention = await this.settlements.findIntention(executionId, organizationId)
        if (!intention) {
            return
        }

        if (intention.state !== 'confirmed' && intention.decision === 'capture') {
            await this.credits.capture(organizationId, executionId)
        } else if (intention.state !== 'confirmed') {
            await this.credits.release(organizationId, executionId)
        }

        const { normalizedAddress, exists } = await this.settlements.confirmSettlement(executionId, organizationId)
        await this.emailAdministration.upsertEmail(organizationId, normalizedAddress, {
            exists,
            lastVerificationId: intention.resultId,
        })
    }
}
