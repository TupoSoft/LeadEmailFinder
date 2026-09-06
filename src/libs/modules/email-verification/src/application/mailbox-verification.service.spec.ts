import { EmailVerificationReason, EmailVerificationSource, ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { MailboxVerificationService } from './mailbox-verification.service'
import { MailboxProbe, MailboxProbeResult } from './ports/mailbox-probe'

const email = 'danilo@microsoft.com'
const [, domain] = email.split('@')
const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const wrongEmail = `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`

function fakeCatchAllVerifier(sourceName: ICatchAllVerifier['sourceName']): jest.Mocked<ICatchAllVerifier> {
    return { sourceName, verify: jest.fn() }
}

describe('MailboxVerificationService', () => {
    let mailboxProbe: jest.Mocked<MailboxProbe>
    let accountDiscoveryVerifiers: Array<jest.Mocked<ICatchAllVerifier>>
    let service: MailboxVerificationService

    beforeEach(() => {
        mailboxProbe = { probe: jest.fn() }
        accountDiscoveryVerifiers = [fakeCatchAllVerifier('microsoft_1'), fakeCatchAllVerifier('microsoft_2')]
        service = new MailboxVerificationService(mailboxProbe, accountDiscoveryVerifiers)
    })

    function probeResult(overrides: Partial<MailboxProbeResult> = {}): MailboxProbeResult {
        return { email, exists: null, reason: 'unknown', ...overrides }
    }

    it('reports a catch-all domain without probing the real address', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ exists: true, targetExchange: 'domain.com', reason: 'accepted_email' }),
        )

        const result = await service.verify(organizationId, email)

        expect(mailboxProbe.probe).toHaveBeenCalledTimes(1)
        expect(mailboxProbe.probe).toHaveBeenCalledWith(organizationId, wrongEmail)
        expect(result.catchAll).toBe(true)
        expect(result.email).toBe(email)
        expect(result.domain).toBe(domain)
    })

    it('probes the real address when the domain is not a catch-all', async () => {
        mailboxProbe.probe
            .mockResolvedValueOnce(probeResult({ exists: false, targetExchange: 'domain.com', reason: 'no_mx_records' }))
            .mockResolvedValueOnce(probeResult({ exists: true, targetExchange: 'domain.com', reason: 'accepted_email' }))

        const result = await service.verify(organizationId, email)

        expect(mailboxProbe.probe).toHaveBeenNthCalledWith(1, organizationId, wrongEmail)
        expect(mailboxProbe.probe).toHaveBeenNthCalledWith(2, organizationId, email)
        expect(result.exists).toBe(true)
        expect(result.sources).toContain(EmailVerificationSource.MX)
        expect(result.reason).toBe(EmailVerificationReason.AcceptedEmail)
    })

    it('falls back to account discovery when the probe is blacklisted', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ exists: true, targetExchange: 'domain.com', reason: 'blacklisted' }),
        )
        const [microsoft1, microsoft2] = accountDiscoveryVerifiers
        microsoft1.verify.mockResolvedValue(true)
        microsoft2.verify.mockResolvedValue(false)

        const result = await service.verify(organizationId, email)

        expect(result.sources).toContain(microsoft1.sourceName)
        expect(result.exists).toBe(true)
        expect(result.reason).toBe(EmailVerificationReason.Webmail)
    })

    it('reports an unknown reason when no probe determines an outcome', async () => {
        mailboxProbe.probe.mockResolvedValue(probeResult({ exists: null, reason: 'unknown' }))

        const result = await service.verify(organizationId, email)

        expect(result.exists).toBeNull()
        expect(result.reason).toBe(EmailVerificationReason.Unknown)
    })

    it('rejects an unrecognized probe reason without leaking the address into the assertion', async () => {
        const sentinel = 'unique-person@private.example'
        mailboxProbe.probe.mockResolvedValueOnce(probeResult({ email: sentinel, exists: null, reason: sentinel as never }))

        const error = await service.verify(organizationId, sentinel).catch((caughtError: unknown) => caughtError)

        expect(error).toMatchObject({ name: 'AssertionError', message: 'email_verification_reason_unknown' })
        expect((error as { message: string }).message).not.toContain(sentinel)
    })

    it('derives the second-level MX domain from the resolved target exchange', async () => {
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ exists: true, targetExchange: 'smtp.mail.example.com', reason: 'accepted_email' }),
        )

        const result = await service.verify(organizationId, email)

        expect(result.mxDomain).toBe('example.com')
    })
})
