import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { MailboxVerificationService } from './mailbox-verification.service'
import { AccountDiscovery } from './ports/account-discovery'
import { MailboxProbe, MailboxProbeResult } from './ports/mailbox-probe'
import { MailboxEvidence, NO_MAILBOX_EVIDENCE } from '../domain/verification-evidence'

const email = 'person@example.test'
const [, domain] = email.split('@')
const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const wrongEmail = `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`
const observedAt = new Date('2026-09-08T00:00:00.000Z')

function accepted(): MailboxEvidence {
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

function missing(): MailboxEvidence {
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

describe('MailboxVerificationService', () => {
    let mailboxProbe: jest.Mocked<MailboxProbe>
    let accountDiscovery: jest.Mocked<AccountDiscovery>
    let service: MailboxVerificationService

    beforeEach(() => {
        mailboxProbe = { probe: jest.fn() }
        accountDiscovery = { discover: jest.fn().mockResolvedValue([]) }
        service = new MailboxVerificationService(mailboxProbe, accountDiscovery)
    })

    function probeResult(overrides: Partial<MailboxProbeResult> = {}): MailboxProbeResult {
        return { email, exists: null, reason: 'unknown', evidence: NO_MAILBOX_EVIDENCE, ...overrides }
    }

    it('preserves the catch-all outcome and response fields when discovery returns no evidence', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({
                exists: true,
                targetExchange: 'smtp.mail.example.com',
                reason: 'accepted_email',
                evidence: accepted(),
            }),
        )

        const result = await service.verify(organizationId, email, EmailPatternEnum.First)

        expect(mailboxProbe.probe).toHaveBeenCalledTimes(1)
        expect(mailboxProbe.probe).toHaveBeenCalledWith(organizationId, wrongEmail)
        expect(accountDiscovery.discover).toHaveBeenCalledTimes(1)
        expect(accountDiscovery.discover).toHaveBeenCalledWith(email)
        expect(result).toEqual({
            email,
            domain,
            localPart: 'person',
            format: EmailPatternEnum.First,
            exists: null,
            catchAll: true,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [],
            targetExchange: 'smtp.mail.example.com',
            mxDomain: 'example.com',
            verificationQuality: 'inconclusive',
            evidenceObservedAt: null,
            evidencePolicyVersion: 1,
        })
    })

    it.each([
        [true, EmailVerificationReason.AcceptedEmail, 'conclusive_positive'],
        [false, EmailVerificationReason.RejectedEmail, 'conclusive_negative'],
    ] as const)(
        'keeps a definitive SMTP outcome (%s) without consulting discovery',
        async (exists, reason, expectedQuality) => {
            mailboxProbe.probe
                .mockResolvedValueOnce(
                    probeResult({ exists: false, targetExchange: 'catchall.example.test', evidence: missing() }),
                )
                .mockResolvedValueOnce(
                    probeResult({
                        exists,
                        targetExchange: 'real.example.test',
                        reason,
                        evidence: exists ? accepted() : missing(),
                    }),
                )

            const result = await service.verify(organizationId, email)

            expect(mailboxProbe.probe).toHaveBeenCalledTimes(2)
            expect(mailboxProbe.probe).toHaveBeenNthCalledWith(1, organizationId, wrongEmail)
            expect(mailboxProbe.probe).toHaveBeenNthCalledWith(2, organizationId, email)
            expect(accountDiscovery.discover).not.toHaveBeenCalled()
            expect(result).toMatchObject({
                exists,
                catchAll: false,
                sources: [EmailVerificationSource.MX],
                reason,
                targetExchange: 'real.example.test',
                verificationQuality: expectedQuality,
                evidenceObservedAt: observedAt,
                evidencePolicyVersion: 1,
            })
        },
    )

    it.each([
        [true, EmailVerificationReason.AcceptedEmail],
        [null, EmailVerificationReason.Blacklisted],
    ] as const)('consults discovery for catch-all %s with reason %s', async (exists, reason) => {
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ exists, reason, evidence: exists === true ? accepted() : NO_MAILBOX_EVIDENCE }),
        )
        accountDiscovery.discover.mockResolvedValue([{ sourceName: 'microsoft_1' }])

        const result = await service.verify(organizationId, email)

        expect(accountDiscovery.discover).toHaveBeenCalledTimes(1)
        expect(accountDiscovery.discover).toHaveBeenCalledWith(email)
        expect(result).toMatchObject({
            catchAll: exists,
            sources: ['microsoft_1'],
            exists: true,
            reason: EmailVerificationReason.Webmail,
            verificationQuality: 'inconclusive',
            evidenceObservedAt: null,
        })
    })

    it('consults discovery when the real probe is inconclusive and blacklisted', async () => {
        mailboxProbe.probe
            .mockResolvedValueOnce(probeResult({ exists: false, evidence: missing() }))
            .mockResolvedValueOnce(probeResult({ exists: null, reason: 'blacklisted' }))
        accountDiscovery.discover.mockResolvedValue([{ sourceName: 'microsoft_2' }])

        const result = await service.verify(organizationId, email)

        expect(accountDiscovery.discover).toHaveBeenCalledWith(email)
        expect(result).toMatchObject({
            catchAll: false,
            exists: true,
            reason: EmailVerificationReason.Webmail,
            sources: ['microsoft_2'],
            verificationQuality: 'inconclusive',
            evidenceObservedAt: null,
        })
    })

    it('keeps the blacklisted outcome when discovery returns no evidence', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(probeResult({ exists: null, reason: 'blacklisted' }))

        const result = await service.verify(organizationId, email)

        expect(accountDiscovery.discover).toHaveBeenCalledTimes(1)
        expect(result).toMatchObject({
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.Blacklisted,
            sources: [],
            verificationQuality: 'inconclusive',
            evidenceObservedAt: null,
        })
    })

    it('filters unknown evidence while preserving known source order and duplicates', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(probeResult({ exists: true, reason: 'accepted_email', evidence: accepted() }))
        const evidence = Object.freeze([
            Object.freeze({ sourceName: 'microsoft_2' }),
            Object.freeze({ sourceName: 'unknown-provider' }),
            Object.freeze({ sourceName: 'microsoft_1' }),
            Object.freeze({ sourceName: 'microsoft_2' }),
        ])
        accountDiscovery.discover.mockResolvedValue(evidence)

        const result = await service.verify(organizationId, email)

        expect(result).toMatchObject({
            exists: true,
            reason: EmailVerificationReason.Webmail,
            sources: ['microsoft_2', 'microsoft_1', 'microsoft_2'],
            verificationQuality: 'inconclusive',
        })
        expect(evidence).toHaveLength(4)
    })

    it('preserves the pre-discovery outcome when all evidence sources are unknown', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(probeResult({ exists: true, reason: 'accepted_email', evidence: accepted() }))
        accountDiscovery.discover.mockResolvedValue([{ sourceName: 'unknown-provider' }])

        await expect(service.verify(organizationId, email)).resolves.toMatchObject({
            exists: null,
            catchAll: true,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [],
            verificationQuality: 'inconclusive',
        })
    })

    it.each([EmailVerificationReason.Unknown, EmailVerificationReason.SecureTransportUnavailable] as const)(
        'skips discovery for an inconclusive %s outcome',
        async reason => {
            mailboxProbe.probe.mockResolvedValueOnce(probeResult({ exists: null, reason }))

            const result = await service.verify(organizationId, email)

            expect(accountDiscovery.discover).not.toHaveBeenCalled()
            expect(result).toMatchObject({
                exists: null,
                catchAll: null,
                reason,
                sources: [],
                verificationQuality: 'inconclusive',
            })
        },
    )

    it('skips discovery after an inconclusive real probe without an eligible reason', async () => {
        mailboxProbe.probe
            .mockResolvedValueOnce(probeResult({ exists: false, evidence: missing() }))
            .mockResolvedValueOnce(probeResult({ exists: null, reason: 'unknown' }))

        const result = await service.verify(organizationId, email)

        expect(accountDiscovery.discover).not.toHaveBeenCalled()
        expect(result).toMatchObject({
            exists: null,
            catchAll: false,
            reason: EmailVerificationReason.Unknown,
            sources: [],
            verificationQuality: 'inconclusive',
        })
    })

    it('rejects an unrecognized probe reason without leaking the address into the assertion', async () => {
        const sentinel = 'unique-person@private.example'
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ email: sentinel, exists: null, reason: sentinel as never }),
        )

        const error = await service.verify(organizationId, sentinel).catch((caughtError: unknown) => caughtError)

        expect(error).toMatchObject({ name: 'AssertionError', message: 'email_verification_reason_unknown' })
        expect((error as { message: string }).message).not.toContain(sentinel)
        expect(accountDiscovery.discover).not.toHaveBeenCalled()
    })
})
