import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { MailboxVerificationService } from './mailbox-verification.service'
import { AccountDiscovery } from './ports/account-discovery'
import { MailboxProbe, MailboxProbeResult } from './ports/mailbox-probe'

const email = 'danilo@microsoft.com'
const [, domain] = email.split('@')
const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const wrongEmail = `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`

function fakeCatchAllVerifier(sourceName: AccountDiscovery['sourceName']): jest.Mocked<AccountDiscovery> {
    return { sourceName, verify: jest.fn() }
}

describe('MailboxVerificationService', () => {
    let mailboxProbe: jest.Mocked<MailboxProbe>
    let accountDiscovery: jest.Mocked<AccountDiscovery>
    let service: MailboxVerificationService

    beforeEach(() => {
        mailboxProbe = { probe: jest.fn() }
        accountDiscovery = fakeCatchAllVerifier('microsoft_1')
        service = new MailboxVerificationService(mailboxProbe, accountDiscovery)
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
            .mockResolvedValueOnce(
                probeResult({ exists: false, targetExchange: 'domain.com', reason: 'no_mx_records' }),
            )
            .mockResolvedValueOnce(
                probeResult({ exists: true, targetExchange: 'domain.com', reason: 'accepted_email' }),
            )

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
        accountDiscovery.verify.mockResolvedValue(true)

        const result = await service.verify(organizationId, email)

        expect(result.sources).toEqual([accountDiscovery.sourceName])
        expect(accountDiscovery.verify).toHaveBeenCalledTimes(1)
        expect(accountDiscovery.verify).toHaveBeenCalledWith(email)
        expect(result.exists).toBe(true)
        expect(result.reason).toBe(EmailVerificationReason.Webmail)
    })

    it('preserves the SMTP outcome when account discovery is disabled', async () => {
        service = new MailboxVerificationService(mailboxProbe, undefined)
        mailboxProbe.probe.mockResolvedValue(probeResult({ exists: true, reason: 'accepted_email' }))

        await expect(service.verify(organizationId, email)).resolves.toMatchObject({
            catchAll: true,
            exists: null,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [],
        })
        expect(accountDiscovery.verify).not.toHaveBeenCalled()
    })

    it.each(['false', 'rejected', 'unknown source'])(
        'preserves the SMTP outcome for account discovery returning %s',
        async outcome => {
            mailboxProbe.probe.mockResolvedValue(probeResult({ exists: true, reason: 'accepted_email' }))
            if (outcome === 'rejected') {
                accountDiscovery.verify.mockRejectedValue(new Error('external-fixture-message'))
            } else {
                accountDiscovery.verify.mockResolvedValue(outcome === 'unknown source')
            }
            if (outcome === 'unknown source') {
                service = new MailboxVerificationService(mailboxProbe, { ...accountDiscovery, sourceName: 'unknown' })
            }

            await expect(service.verify(organizationId, email)).resolves.toMatchObject({
                catchAll: true,
                exists: null,
                reason: EmailVerificationReason.AcceptedEmail,
                sources: [],
            })
            expect(accountDiscovery.verify).toHaveBeenCalledTimes(1)
        },
    )

    it('does not consult account discovery for a definitive mailbox result', async () => {
        mailboxProbe.probe
            .mockResolvedValueOnce(probeResult({ exists: false, reason: 'rejected_email' }))
            .mockResolvedValueOnce(probeResult({ exists: true, reason: 'accepted_email' }))

        await service.verify(organizationId, email)

        expect(accountDiscovery.verify).not.toHaveBeenCalled()
    })

    it('reports an unknown reason when no probe determines an outcome', async () => {
        mailboxProbe.probe.mockResolvedValue(probeResult({ exists: null, reason: 'unknown' }))

        const result = await service.verify(organizationId, email)

        expect(result.exists).toBeNull()
        expect(result.reason).toBe(EmailVerificationReason.Unknown)
    })

    it('rejects an unrecognized probe reason without leaking the address into the assertion', async () => {
        const sentinel = 'unique-person@private.example'
        mailboxProbe.probe.mockResolvedValueOnce(
            probeResult({ email: sentinel, exists: null, reason: sentinel as never }),
        )

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
