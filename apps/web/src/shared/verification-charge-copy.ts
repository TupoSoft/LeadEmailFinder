import type { components } from '@tuposoft/lead-email-finder-api-client'

export const verificationChargeCopy = {
    region: 'Verification charges',
    status: 'Charge status',
    originalReservation: 'Original reservation',
    charged: 'Confirmed charge',
    pending: 'Settlement pending',
    settled: 'Settled',
    unavailable: 'Charge details unavailable',
    notReported: 'Not reported',
    noCharge: 'No credits charged',
    chargePending: 'Final charge pending',
    pendingExplanation: 'Credit accounting is still pending. The final charge will appear after settlement.',
    unavailableExplanation:
        'Refresh the status to check for charge details. A missing amount does not mean the check was free.',
}

const formatter = new Intl.NumberFormat('en')
function credits(amount: number) {
    return `${formatter.format(amount)} ${amount === 1 ? 'credit' : 'credits'}`
}

export function reservedCreditLabel(amount: number): string {
    return `${credits(amount)} initially reserved`
}

export function chargedCreditLabel(billing: components['schemas']['VerificationOperationBillingDto']): string {
    if (billing.state === 'pending')
        return billing.charged > 0 ? `${credits(billing.charged)} charged so far` : verificationChargeCopy.chargePending
    return billing.charged === 0 ? verificationChargeCopy.noCharge : `${credits(billing.charged)} charged`
}
