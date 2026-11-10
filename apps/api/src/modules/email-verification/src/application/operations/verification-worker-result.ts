import {
    CompletedVerificationResult,
    classifyVerificationQuality,
    deriveEvidenceObservedAt,
    deserializeMailboxEvidence,
    VERIFICATION_EVIDENCE_POLICY_VERSION,
} from '@tuposoft/lead-email-finder-verification-contracts'
import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { NewEmailVerification } from '../../domain/email-verification'

export class VerificationEvidenceExpiredError extends Error {
    constructor() {
        super('verification_evidence_expired')
    }
}

/** Worker observations supply evidence, never a debit decision or authoritative verification quality. */
export function buildWorkerVerification(
    email: string,
    result: CompletedVerificationResult,
    now: Date,
): NewEmailVerification {
    const target = deserializeMailboxEvidence(result.targetEvidence)
    const control = deserializeMailboxEvidence(result.controlEvidence)

    for (const evidence of [target, control]) {
        if (evidence.kind !== 'none') {
            const ageMs = now.getTime() - evidence.observedAt.getTime()

            if (ageMs < 0 || ageMs >= 86_400_000) {
                throw new VerificationEvidenceExpiredError()
            }
        }
    }

    const quality = classifyVerificationQuality(target, control)
    const workerReason = Object.values(EmailVerificationReason).find(value => String(value) === result.reason)

    if (!workerReason) {
        throw new Error('verification_reason_invalid')
    }

    const sources = result.sources.map(source => {
        const known = Object.values(EmailVerificationSource).find(value => String(value) === source)

        if (!known) {
            throw new Error('verification_source_invalid')
        }

        return known
    })

    let exists = result.exists
    let reason = workerReason

    if (quality === 'conclusive_positive') {
        exists = true
        reason = EmailVerificationReason.AcceptedEmail
    } else if (quality === 'conclusive_negative') {
        exists = false
        reason = EmailVerificationReason.RejectedEmail
    }

    let catchAll = result.catchAll

    if (control.kind === 'smtp_recipient_accepted') {
        catchAll = true
    } else if (control.kind === 'smtp_recipient_missing') {
        catchAll = false
    }

    const [localPart, domain] = email.split('@')

    return {
        email,
        localPart,
        domain,
        exists,
        catchAll,
        reason,
        sources,
        targetExchange: result.targetExchange,
        mxDomain: result.mxDomain,
        verificationQuality: quality,
        evidenceObservedAt: deriveEvidenceObservedAt(quality, target, control),
        evidencePolicyVersion: VERIFICATION_EVIDENCE_POLICY_VERSION,
    }
}
