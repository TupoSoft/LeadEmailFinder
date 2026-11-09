import { MailboxEvidence, VerificationQuality } from '../domain/verification-evidence'

/**
 * Policy version 1: a positive answer requires an accepted target together with a conclusively missing control.
 * A negative answer requires its own missing-recipient proof on the target alone.
 */
export function classifyVerificationQuality(target: MailboxEvidence, control: MailboxEvidence): VerificationQuality {
    if (target.kind === 'smtp_recipient_missing') return 'conclusive_negative'
    if (target.kind === 'smtp_recipient_accepted' && control.kind === 'smtp_recipient_missing') {
        return 'conclusive_positive'
    }

    return 'inconclusive'
}

function decisiveObservedAtValues(evidences: readonly MailboxEvidence[]): number[] {
    return evidences.filter(evidence => evidence.kind !== 'none').map(evidence => evidence.observedAt.getTime())
}

/** Derives the oldest decisive observation backing a quality result. Reads never advance this time. */
export function deriveEvidenceObservedAt(
    quality: VerificationQuality,
    target: MailboxEvidence,
    control: MailboxEvidence,
): Date | null {
    if (quality === 'conclusive_negative') {
        return target.kind === 'smtp_recipient_missing' ? target.observedAt : null
    }

    if (quality === 'conclusive_positive') {
        const observedAtValues = decisiveObservedAtValues([target, control])
        return observedAtValues.length > 0 ? new Date(Math.min(...observedAtValues)) : null
    }

    return null
}
