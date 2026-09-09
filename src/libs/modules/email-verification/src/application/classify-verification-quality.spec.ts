import { classifyVerificationQuality, deriveEvidenceObservedAt } from './classify-verification-quality'
import { MailboxEvidence, NO_MAILBOX_EVIDENCE } from './../domain/verification-evidence'

const olderObservedAt = new Date('2026-09-08T00:00:00.000Z')
const newerObservedAt = new Date('2026-09-08T01:00:00.000Z')

function accepted(observedAt: Date = newerObservedAt): MailboxEvidence {
    return {
        kind: 'smtp_recipient_accepted',
        observedAt,
        policyVersion: 1,
        origin: 'fresh',
        stage: 'rcpt_to',
        code: 250,
        verifiedTransport: true,
        senderAccepted: true,
    }
}

function missing(observedAt: Date = olderObservedAt): MailboxEvidence {
    return {
        kind: 'smtp_recipient_missing',
        observedAt,
        policyVersion: 1,
        origin: 'fresh',
        stage: 'rcpt_to',
        code: 550,
        enhancedCode: '5.1.1',
        verifiedTransport: true,
        senderAccepted: true,
    }
}

describe('classifyVerificationQuality', () => {
    it('is conclusive_positive only for an accepted target with a missing control', () => {
        expect(classifyVerificationQuality(accepted(), missing())).toBe('conclusive_positive')
    })

    it('is conclusive_negative for a missing target regardless of the control state', () => {
        expect(classifyVerificationQuality(missing(), accepted())).toBe('conclusive_negative')
        expect(classifyVerificationQuality(missing(), missing())).toBe('conclusive_negative')
        expect(classifyVerificationQuality(missing(), NO_MAILBOX_EVIDENCE)).toBe('conclusive_negative')
    })

    it('is inconclusive for an accepted target without a missing control (a genuine catch-all)', () => {
        expect(classifyVerificationQuality(accepted(), accepted())).toBe('inconclusive')
        expect(classifyVerificationQuality(accepted(), NO_MAILBOX_EVIDENCE)).toBe('inconclusive')
    })

    it('is inconclusive when the target has no proof at all', () => {
        expect(classifyVerificationQuality(NO_MAILBOX_EVIDENCE, missing())).toBe('inconclusive')
        expect(classifyVerificationQuality(NO_MAILBOX_EVIDENCE, accepted())).toBe('inconclusive')
        expect(classifyVerificationQuality(NO_MAILBOX_EVIDENCE, NO_MAILBOX_EVIDENCE)).toBe('inconclusive')
    })
})

describe('deriveEvidenceObservedAt', () => {
    it('uses the target observation alone for a conclusive negative', () => {
        const target = missing(olderObservedAt)
        expect(deriveEvidenceObservedAt('conclusive_negative', target, accepted(newerObservedAt))).toEqual(
            olderObservedAt,
        )
    })

    it('returns null for a conclusive negative claim with no missing target (defensive, never produced by the classifier)', () => {
        expect(deriveEvidenceObservedAt('conclusive_negative', accepted(), missing())).toBeNull()
    })

    it('uses the oldest decisive observation for a conclusive positive, including a reused control', () => {
        const target = accepted(newerObservedAt)
        const control = missing(olderObservedAt)
        expect(deriveEvidenceObservedAt('conclusive_positive', target, control)).toEqual(olderObservedAt)
    })

    it('returns null for an inconclusive result even when decisive evidence happens to be present', () => {
        expect(deriveEvidenceObservedAt('inconclusive', accepted(), missing())).toBeNull()
    })
})
