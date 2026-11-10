export const VERIFICATION_EVIDENCE_POLICY_VERSION = 1 as const

export type VerificationQuality = 'conclusive_positive' | 'conclusive_negative' | 'inconclusive'

export type MailboxEvidenceOrigin = 'fresh' | 'stored'

interface RecipientEvidenceBase {
    observedAt: Date
    policyVersion: number
    origin: MailboxEvidenceOrigin
    stage: 'rcpt_to'
    code: number
    verifiedTransport: true
    senderAccepted: true
}

export interface SmtpRecipientAcceptedEvidence extends RecipientEvidenceBase {
    kind: 'smtp_recipient_accepted'
    enhancedCode?: string
}

export interface SmtpRecipientMissingEvidence extends RecipientEvidenceBase {
    kind: 'smtp_recipient_missing'
    enhancedCode: '5.1.1'
}

export interface NoMailboxEvidence {
    kind: 'none'
}

export type MailboxEvidence = SmtpRecipientAcceptedEvidence | SmtpRecipientMissingEvidence | NoMailboxEvidence

export const NO_MAILBOX_EVIDENCE: NoMailboxEvidence = { kind: 'none' }

export interface RawRecipientObservation {
    stage: 'ehlo' | 'starttls' | 'mail_from' | 'rcpt_to' | 'quit'
    code: number
    enhancedCode?: string
    verifiedTransport: boolean
    senderAccepted: boolean
    observedAt: Date
    origin: MailboxEvidenceOrigin
}

/** Turns a raw SMTP observation into typed evidence. Acceptance requires 250; absence requires a 5xx with exact enhanced code 5.1.1. */
export function deriveMailboxEvidence(observation: RawRecipientObservation | null): MailboxEvidence {
    if (observation === null) {
        return NO_MAILBOX_EVIDENCE
    }

    const { stage, code, enhancedCode, verifiedTransport, senderAccepted, observedAt, origin } = observation

    if (stage !== 'rcpt_to' || !verifiedTransport || !senderAccepted) {
        return NO_MAILBOX_EVIDENCE
    }

    if (code === 250) {
        return {
            kind: 'smtp_recipient_accepted',
            observedAt,
            policyVersion: VERIFICATION_EVIDENCE_POLICY_VERSION,
            origin,
            stage,
            code,
            enhancedCode,
            verifiedTransport: true,
            senderAccepted: true,
        }
    }

    if (code >= 500 && code <= 599 && enhancedCode === '5.1.1') {
        return {
            kind: 'smtp_recipient_missing',
            observedAt,
            policyVersion: VERIFICATION_EVIDENCE_POLICY_VERSION,
            origin,
            stage,
            code,
            enhancedCode: '5.1.1',
            verifiedTransport: true,
            senderAccepted: true,
        }
    }

    return NO_MAILBOX_EVIDENCE
}

/**
 * Policy version 1: a positive answer requires an accepted target together with a conclusively missing control.
 * A negative answer requires its own missing-recipient proof on the target alone.
 */
export function classifyVerificationQuality(target: MailboxEvidence, control: MailboxEvidence): VerificationQuality {
    if (target.kind === 'smtp_recipient_missing') {
        return 'conclusive_negative'
    }

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
        if (target.kind === 'smtp_recipient_missing') {
            return target.observedAt
        }

        return null
    }

    if (quality === 'conclusive_positive') {
        const observedAtValues = decisiveObservedAtValues([target, control])

        if (observedAtValues.length === 0) {
            return null
        }

        return new Date(Math.min(...observedAtValues))
    }

    return null
}
