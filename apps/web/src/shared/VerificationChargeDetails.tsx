import type { components } from '@tuposoft/lead-email-finder-api-client'
import { SignalDetails } from './SignalDetails'
import { chargedCreditLabel, reservedCreditLabel, verificationChargeCopy as copy } from './verification-charge-copy'
import styles from './VerificationChargeDetails.module.css'

export function VerificationChargeDetails({
    billing,
    reason,
}: {
    billing?: components['schemas']['VerificationOperationBillingDto']
    reason?: string
}) {
    const explanation =
        billing?.state === 'pending' ? copy.pendingExplanation : billing ? reason : copy.unavailableExplanation
    return (
        <section className={styles.charges} aria-label={copy.region} aria-live="polite" aria-atomic="true">
            <SignalDetails
                entries={[
                    {
                        label: copy.status,
                        value: billing ? (billing.state === 'pending' ? copy.pending : copy.settled) : copy.unavailable,
                    },
                    {
                        label: copy.originalReservation,
                        value: billing ? reservedCreditLabel(billing.reserved) : copy.notReported,
                    },
                    { label: copy.charged, value: billing ? chargedCreditLabel(billing) : copy.notReported },
                ]}
            />
            {explanation ? <p>{explanation}</p> : null}
        </section>
    )
}
