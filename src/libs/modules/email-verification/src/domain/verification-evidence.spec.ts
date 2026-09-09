import { deriveMailboxEvidence, RawRecipientObservation, VERIFICATION_EVIDENCE_POLICY_VERSION } from './verification-evidence'

const observedAt = new Date('2026-09-08T00:00:00.000Z')

function observation(overrides: Partial<RawRecipientObservation> = {}): RawRecipientObservation {
    return {
        stage: 'rcpt_to',
        code: 250,
        verifiedTransport: true,
        senderAccepted: true,
        observedAt,
        origin: 'fresh',
        ...overrides,
    }
}

describe('deriveMailboxEvidence', () => {
    it('returns none for a null observation', () => {
        expect(deriveMailboxEvidence(null)).toEqual({ kind: 'none' })
    })

    it('accepts target 250 after verified transport and an accepted sender', () => {
        expect(deriveMailboxEvidence(observation())).toEqual({
            kind: 'smtp_recipient_accepted',
            observedAt,
            policyVersion: VERIFICATION_EVIDENCE_POLICY_VERSION,
            origin: 'fresh',
            stage: 'rcpt_to',
            code: 250,
            enhancedCode: undefined,
            verifiedTransport: true,
            senderAccepted: true,
        })
    })

    it('recognizes a missing recipient only at exact enhanced status 5.1.1', () => {
        expect(deriveMailboxEvidence(observation({ code: 550, enhancedCode: '5.1.1' }))).toEqual({
            kind: 'smtp_recipient_missing',
            observedAt,
            policyVersion: VERIFICATION_EVIDENCE_POLICY_VERSION,
            origin: 'fresh',
            stage: 'rcpt_to',
            code: 550,
            enhancedCode: '5.1.1',
            verifiedTransport: true,
            senderAccepted: true,
        })
    })

    it.each([550, 554])('treats a %s rejection with a different enhanced status as no proof', code => {
        expect(deriveMailboxEvidence(observation({ code, enhancedCode: '5.7.1' }))).toEqual({ kind: 'none' })
    })

    it('treats a bare rejection with no enhanced status as no proof', () => {
        expect(deriveMailboxEvidence(observation({ code: 550, enhancedCode: undefined }))).toEqual({ kind: 'none' })
    })

    it('treats a 5.1.1 rejection at a different command stage as no proof', () => {
        expect(deriveMailboxEvidence(observation({ stage: 'mail_from', code: 550, enhancedCode: '5.1.1' }))).toEqual({
            kind: 'none',
        })
    })

    it('treats an unverified transport as no proof even with an otherwise decisive response', () => {
        expect(deriveMailboxEvidence(observation({ verifiedTransport: false }))).toEqual({ kind: 'none' })
        expect(
            deriveMailboxEvidence(observation({ code: 550, enhancedCode: '5.1.1', verifiedTransport: false })),
        ).toEqual({ kind: 'none' })
    })

    it('treats an unaccepted sender as no proof even with an otherwise decisive response', () => {
        expect(deriveMailboxEvidence(observation({ senderAccepted: false }))).toEqual({ kind: 'none' })
    })

    it('treats a temporary or unrelated status code as no proof', () => {
        expect(deriveMailboxEvidence(observation({ code: 450 }))).toEqual({ kind: 'none' })
        expect(deriveMailboxEvidence(observation({ code: 221 }))).toEqual({ kind: 'none' })
    })
})
