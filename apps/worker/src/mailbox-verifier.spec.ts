import { Resolver } from 'node:dns/promises'
import { VerificationCommand } from '@tuposoft/lead-email-finder-verification-contracts'
import { MailboxVerifier } from './mailbox-verifier'
import { SmtpObservation, SmtpSession, SmtpReplyError } from './smtp-session'

jest.mock('node:dns/promises', () => ({ Resolver: jest.fn() }))
jest.mock('./smtp-session', () => ({
    ...jest.requireActual<typeof import('./smtp-session')>('./smtp-session'),
    SmtpSession: jest.fn(),
}))

const command: VerificationCommand = {
    version: 1,
    executionId: '00000000-0000-4000-8000-000000000001',
    organizationId: '00000000-0000-4000-8000-000000000002',
    attemptId: '00000000-0000-4000-8000-000000000003',
    email: 'person@example.com',
    deadlineAt: '2099-01-01T00:00:00.000Z',
}
const identity = { ehloHostname: 'worker.example.com', mailFrom: 'sender@example.com' }
const signal = new AbortController().signal

function observation(code: number, enhancedCode = ''): SmtpObservation {
    return {
        code,
        enhancedCode,
        stage: 'rcpt_to',
        observedAt: new Date(),
        origin: 'fresh',
        verifiedTransport: true,
        senderAccepted: true,
        blacklisted: false,
        senderBlocked: false,
    }
}

describe('MailboxVerifier', () => {
    const probe = jest.fn<Promise<SmtpObservation>, []>()
    const close = jest.fn<Promise<void>, []>()
    const resolveMx = jest.fn()
    const resolve4 = jest.fn()
    const resolve6 = jest.fn()
    const cancel = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        close.mockResolvedValue()
        resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }])
        resolve4.mockResolvedValue(['93.184.216.34'])
        resolve6.mockResolvedValue([])
        jest.mocked(Resolver).mockImplementation(
            () => ({ resolveMx, resolve4, resolve6, cancel }) as unknown as Resolver,
        )
        jest.mocked(SmtpSession).mockImplementation(() => ({ probe, close }) as unknown as SmtpSession)
        probe.mockImplementation(() => Promise.resolve(observation(550, '5.1.1')))
    })

    afterEach(() => jest.restoreAllMocks())

    it('connects using the client created for the vetted MX address', async () => {
        await new MailboxVerifier(identity).verify(command, signal)
        expect(probe).toHaveBeenCalledWith('93.184.216.34', 'mx.example.com', expect.any(String))
    })

    it('destroys a connect-phase client when probing rejects', async () => {
        probe.mockRejectedValueOnce(new Error('connection_failed'))
        await new MailboxVerifier(identity).verify(command, signal)
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('returns a conclusive result only from the requesting organization cache', async () => {
        const verifier = new MailboxVerifier(identity)
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(2)
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(2)
        await verifier.verify({ ...command, organizationId: '00000000-0000-4000-8000-000000000004' }, signal)
        expect(probe).toHaveBeenCalledTimes(4)
    })

    it('releases the selected client after SMTP verification completes', async () => {
        await new MailboxVerifier(identity).verify(command, signal)
        expect(close).toHaveBeenCalledTimes(2)
        expect(cancel).toHaveBeenCalledTimes(3)
    })

    it('ignores a conclusive observation that is not proven to use secure transport', async () => {
        probe.mockResolvedValue({ ...observation(550, '5.1.1'), verifiedTransport: false })
        const verifier = new MailboxVerifier(identity)
        await verifier.verify(command, signal)
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(2)
    })

    it('ignores stale cached evidence that is 24 hours old or older', async () => {
        const verifier = new MailboxVerifier(identity)
        await verifier.verify(command, signal)
        const future = Date.now() + 24 * 60 * 60 * 1000
        jest.spyOn(Date, 'now').mockReturnValue(future)
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(4)
    })

    it('ignores cached evidence whose observation time is in the future', async () => {
        const verifier = new MailboxVerifier(identity)
        await verifier.verify(command, signal)
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 60_000)
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(4)
    })

    it('maps STARTTLS negotiation failure before producing address evidence', async () => {
        probe.mockRejectedValueOnce(new SmtpReplyError('secure_transport_unavailable'))
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: { exists: null, reason: 'secure_transport_unavailable', targetEvidence: { kind: 'none' } },
        })
    })

    it('records conclusive positive evidence for a target 250 and missing control', async () => {
        probe.mockResolvedValueOnce(observation(550, '5.1.1')).mockResolvedValueOnce(observation(250))
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: {
                exists: true,
                targetEvidence: { kind: 'smtp_recipient_accepted' },
                controlEvidence: { kind: 'smtp_recipient_missing' },
            },
        })
    })

    it('records conclusive missing-recipient evidence for a target 550 5.1.1', async () => {
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: { exists: false, targetEvidence: { kind: 'smtp_recipient_missing' } },
        })
    })

    it('treats a generic RCPT TO rejection with a different enhanced status as ineligible', async () => {
        probe.mockResolvedValueOnce(observation(550, '5.1.1')).mockResolvedValueOnce(observation(550, '5.7.1'))
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: { exists: null, targetEvidence: { kind: 'none' } },
        })
    })

    it('does not treat the same 550 5.1.1 rejection at MAIL FROM as conclusive', async () => {
        probe.mockResolvedValue({ ...observation(550, '5.1.1'), stage: 'mail_from', senderAccepted: false })
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: { exists: null, targetEvidence: { kind: 'none' } },
        })
    })

    it('retries repeated temporary failures instead of caching them as mailbox outcomes', async () => {
        probe.mockResolvedValue(observation(450))
        const verifier = new MailboxVerifier(identity)
        await expect(verifier.verify(command, signal)).resolves.toMatchObject({
            outcome: 'retryable-failure',
            failureReason: 'temporarily_blocked',
        })
        await verifier.verify(command, signal)
        expect(probe).toHaveBeenCalledTimes(2)
    })

    it('resolves MX exchanges through the DNS resolver', async () => {
        resolveMx.mockResolvedValue([])
        await expect(new MailboxVerifier(identity).verify(command, signal)).resolves.toMatchObject({
            outcome: 'completed',
            result: { exists: null, reason: 'no_mx_records' },
        })
        expect(resolveMx).toHaveBeenCalledWith('example.com')
        expect(probe).not.toHaveBeenCalled()
    })
})
