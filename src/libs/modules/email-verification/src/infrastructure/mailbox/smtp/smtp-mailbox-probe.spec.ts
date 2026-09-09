import { SmtpMailboxProbe } from './smtp-mailbox-probe'
import { SmtpVerificationReason } from './smtp.enums'
import { IAllocationObserver, IProxy, IProxyAllocator, LeasedProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { ISmtpClient } from './smtp-client.interface'
import { SmtpException } from './smtp.exception'
import { Logger } from '@nestjs/common'
import { SmtpSecureTransportUnavailableException } from '../../smtp/smtp-secure-transport-unavailable.exception'
import { MxResolver } from '../../../application/ports/mx-resolver'
import { SmtpVerificationStore } from '../../../application/ports/smtp-verification-store'
import { VerificationClock } from '../../../application/ports/verification-clock'
import { MailboxEvidence, NO_MAILBOX_EVIDENCE } from '../../../domain/verification-evidence'

interface SmtpMailboxProbeInternals {
    tryConnect: jest.Mock
    getExchanges: jest.Mock
    getSmtpClient: jest.Mock
    tryVerify: jest.Mock
}

const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const otherOrganizationId = '3dc5deaf-c1f0-4b48-a0dc-caa8504f3a78'
const email = 'person@example.com'
const now = new Date('2026-09-08T12:00:00.000Z')

function acceptedEvidence(observedAt: Date = now, origin: 'fresh' | 'stored' = 'fresh'): MailboxEvidence {
    return {
        kind: 'smtp_recipient_accepted',
        observedAt,
        policyVersion: 1,
        origin,
        stage: 'rcpt_to',
        code: 250,
        enhancedCode: origin === 'fresh' ? '' : undefined,
        verifiedTransport: true,
        senderAccepted: true,
    }
}

function missingEvidence(observedAt: Date = now): MailboxEvidence {
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

describe('SmtpMailboxProbe', () => {
    let probe: SmtpMailboxProbe
    let internals: SmtpMailboxProbeInternals
    let mxResolver: jest.Mocked<MxResolver>
    let proxyAllocator: { acquire: jest.Mock; release: jest.Mock }
    let smtpClientFactory: { create: jest.Mock }
    let smtpVerificationStore: jest.Mocked<SmtpVerificationStore>
    let allocationObserver: { onAllocation: jest.Mock; onConnectionOutcome: jest.Mock; onLeaseRelease: jest.Mock }
    let clock: jest.Mocked<VerificationClock>
    let loggerErrorSpy: jest.SpiedFunction<Logger['error']>

    beforeEach(() => {
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
        mxResolver = { resolve: jest.fn() }
        proxyAllocator = { acquire: jest.fn(), release: jest.fn() }
        smtpClientFactory = { create: jest.fn() }
        smtpVerificationStore = { findByAddress: jest.fn(), upsert: jest.fn() }
        allocationObserver = { onAllocation: jest.fn(), onConnectionOutcome: jest.fn(), onLeaseRelease: jest.fn() }
        clock = { now: jest.fn().mockReturnValue(now) }
        probe = new SmtpMailboxProbe(
            { resolve: jest.fn() } as any,
            mxResolver,
            { addToBlacklist: jest.fn() } as any,
            proxyAllocator as unknown as IProxyAllocator,
            smtpClientFactory,
            smtpVerificationStore,
            allocationObserver as unknown as IAllocationObserver,
            clock,
        )
        internals = probe as unknown as SmtpMailboxProbeInternals
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
    })

    it('connects using the client created by the injected factory', async () => {
        const proxy = createAllocation('proxy-id').proxy
        const client = { connect: jest.fn().mockResolvedValue(undefined) } as unknown as ISmtpClient
        smtpClientFactory.create.mockReturnValue(client)

        await expect(internals.tryConnect('mx.example.com', proxy)).resolves.toBe(client)
        expect(smtpClientFactory.create).toHaveBeenCalledWith({ host: 'mx.example.com', proxy })
        expect(client.connect).toHaveBeenCalledTimes(1)
    })

    it('destroys the connect-phase client when connect() rejects', async () => {
        const proxy = createAllocation('proxy-id').proxy
        const client = {
            connect: jest.fn().mockRejectedValue(new Error('boom')),
            end: jest.fn(),
        } as unknown as ISmtpClient
        smtpClientFactory.create.mockReturnValue(client)

        await expect(internals.tryConnect('mx.example.com', proxy)).rejects.toThrow('boom')
        expect(client.end).toHaveBeenCalledTimes(1)
    })

    it('tries leased proxies serially and releases a failed allocation before the next attempt', async () => {
        const first = createAllocation('first-proxy')
        const second = createAllocation('second-proxy')
        proxyAllocator.acquire.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
        proxyAllocator.release.mockResolvedValue(true)
        const tryConnect = jest.fn().mockRejectedValueOnce(new Error('first failed')).mockResolvedValueOnce({})
        internals.tryConnect = tryConnect

        await expect(internals.getSmtpClient({ exchanges: ['mx.example.com'] })).resolves.toEqual({
            leasedClient: { client: {}, allocation: second },
            attemptedConnection: true,
        })
        expect(tryConnect).toHaveBeenCalledTimes(2)
        expect(proxyAllocator.acquire).toHaveBeenNthCalledWith(1, 'mx.example.com', undefined, [])
        expect(proxyAllocator.acquire).toHaveBeenNthCalledWith(2, 'mx.example.com', undefined, ['first-proxy'])
        expect(proxyAllocator.release).toHaveBeenCalledWith(first)
        expect(proxyAllocator.release).not.toHaveBeenCalledWith(second)
        expect(allocationObserver.onConnectionOutcome).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ outcome: 'failed', mxHost: 'mx.example.com', proxyId: 'first-proxy' }),
        )
        expect(allocationObserver.onConnectionOutcome).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ outcome: 'connected', mxHost: 'mx.example.com', proxyId: 'second-proxy' }),
        )
    })

    it('does not let a throwing observer prevent a successful connection from being returned', async () => {
        const allocation = createAllocation('proxy-id')
        proxyAllocator.acquire.mockResolvedValueOnce(allocation)
        const client = {}
        internals.tryConnect = jest.fn().mockResolvedValue(client)
        allocationObserver.onConnectionOutcome.mockImplementation(() => {
            throw new Error('logger exploded')
        })

        await expect(internals.getSmtpClient({ exchanges: ['mx.example.com'] })).resolves.toEqual({
            leasedClient: { client, allocation },
            attemptedConnection: true,
        })
    })

    it('does not let a throwing observer prevent releasing a failed allocation', async () => {
        const allocation = createAllocation('proxy-id')
        proxyAllocator.acquire.mockResolvedValueOnce(allocation).mockResolvedValueOnce(undefined)
        proxyAllocator.release.mockResolvedValue(true)
        internals.tryConnect = jest.fn().mockRejectedValue(new Error('connect failed'))
        allocationObserver.onConnectionOutcome.mockImplementation(() => {
            throw new Error('logger exploded')
        })

        await expect(internals.getSmtpClient({ exchanges: ['mx.example.com'] })).resolves.toEqual({
            attemptedConnection: true,
        })
        expect(proxyAllocator.release).toHaveBeenCalledWith(allocation)
    })

    it('returns an unknown result when no lease can be allocated', async () => {
        proxyAllocator.acquire.mockResolvedValue(undefined)
        smtpVerificationStore.findByAddress.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
            evidence: NO_MAILBOX_EVIDENCE,
        })
        expect(smtpVerificationStore.findByAddress).toHaveBeenCalledWith(organizationId, email)
    })

    it('returns an unknown result without logging a remote allocation error message', async () => {
        const sentinel = 'unique-person@private.example'
        const remoteError = new Error(`Redis unavailable for ${sentinel}`)
        Object.defineProperty(remoteError, 'constructor', { value: { name: sentinel } })
        proxyAllocator.acquire.mockRejectedValue(remoteError)
        smtpVerificationStore.findByAddress.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
            evidence: NO_MAILBOX_EVIDENCE,
        })
        expect(loggerErrorSpy).toHaveBeenCalledWith('smtp_connection_failed', { errorClass: 'Error' })
        expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(sentinel)
    })

    it('returns a conclusive result only from the requesting organization cache', async () => {
        smtpVerificationStore.findByAddress.mockImplementation((requestedOrganizationId: string) => {
            if (requestedOrganizationId !== organizationId) return Promise.resolve(null)

            return Promise.resolve({
                organizationId,
                id: email,
                exists: true,
                reason: SmtpVerificationReason.AcceptedEmail,
                targetExchange: 'mx.example.com',
                secureTransport: true,
                evidenceObservedAt: now,
                evidencePolicyVersion: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            evidence: acceptedEvidence(now, 'stored'),
        })
        await expect(probe.probe(otherOrganizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })

        expect(smtpVerificationStore.findByAddress).toHaveBeenNthCalledWith(1, organizationId, email)
        expect(smtpVerificationStore.findByAddress).toHaveBeenNthCalledWith(2, otherOrganizationId, email)
        expect(internals.getExchanges).toHaveBeenCalledTimes(1)
    })

    it('reuses temporarily blocked connection hints only from the requesting organization cache', async () => {
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: null,
            reason: SmtpVerificationReason.TemporarilyBlocked,
            targetExchange: 'mx.example.com',
            proxyId: 'proxy-id',
            secureTransport: true,
            evidenceObservedAt: null,
            evidencePolicyVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({ attemptedConnection: false })

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
            evidence: NO_MAILBOX_EVIDENCE,
        })

        expect(smtpVerificationStore.findByAddress).toHaveBeenCalledWith(organizationId, email)
        expect(internals.getExchanges).toHaveBeenCalledWith({
            domain: 'example.com',
            targetExchange: 'mx.example.com',
        })
        expect(internals.getSmtpClient).toHaveBeenCalledWith({
            exchanges: ['mx.example.com'],
            proxyId: 'proxy-id',
        })
    })

    it('releases the selected allocation after SMTP verification completes', async () => {
        const allocation = createAllocation('proxy-id')
        const client = { secureTransport: true } as any
        const result = {
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            evidence: acceptedEvidence(),
        }
        smtpVerificationStore.findByAddress.mockResolvedValueOnce(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({
            leasedClient: { client, allocation },
            attemptedConnection: true,
        })
        internals.tryVerify = jest.fn().mockResolvedValue(result)
        proxyAllocator.release.mockResolvedValue(true)

        await expect(probe.probe(organizationId, email)).resolves.toEqual(result)
        expect(smtpVerificationStore.findByAddress).toHaveBeenCalledWith(organizationId, email)
        expect(smtpVerificationStore.upsert).toHaveBeenCalledWith(organizationId, email, {
            reason: SmtpVerificationReason.AcceptedEmail,
            exists: true,
            targetExchange: undefined,
            proxyId: undefined,
            secureTransport: true,
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })
        expect(proxyAllocator.release).toHaveBeenCalledWith(allocation)
    })

    it('ignores a conclusive cache row that is not proven to use secure transport', async () => {
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            secureTransport: false,
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })
        expect(internals.getExchanges).toHaveBeenCalledTimes(1)
    })

    it('ignores a stale cache row whose evidence is 24 hours old or older', async () => {
        const staleObservedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            secureTransport: true,
            evidenceObservedAt: staleObservedAt,
            evidencePolicyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })
    })

    it('ignores a cache row whose evidence policy version does not match the current policy', async () => {
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            secureTransport: true,
            evidenceObservedAt: now,
            evidencePolicyVersion: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })
    })

    it('ignores a cache row with no recorded evidence observation time', async () => {
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            secureTransport: true,
            evidenceObservedAt: null,
            evidencePolicyVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })
    })

    it('ignores a cache row whose evidence observation time is in the future', async () => {
        const futureObservedAt = new Date(now.getTime() + 1000)
        smtpVerificationStore.findByAddress.mockResolvedValue({
            organizationId,
            id: email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            secureTransport: true,
            evidenceObservedAt: futureObservedAt,
            evidencePolicyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(probe.probe(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.NoMxRecords,
            evidence: NO_MAILBOX_EVIDENCE,
        })
    })

    it('maps STARTTLS negotiation failure before sending either address-bearing command', async () => {
        const client = {
            hostname: 'client.example.com',
            exchange: 'mx.example.com',
            secureTransport: false,
            startSession: jest.fn().mockRejectedValue(new SmtpSecureTransportUnavailableException()),
            mailFrom: jest.fn(),
            rcptTo: jest.fn(),
            quit: jest.fn(),
            end: jest.fn(),
        } as unknown as ISmtpClient

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.SecureTransportUnavailable,
            targetExchange: 'mx.example.com',
            evidence: NO_MAILBOX_EVIDENCE,
        })
        expect(client.startSession).toHaveBeenCalledWith('client.example.com')
        expect(client.mailFrom).not.toHaveBeenCalled()
        expect(client.rcptTo).not.toHaveBeenCalled()
        expect(client.end).toHaveBeenCalledTimes(1)
    })

    function fakeClient(overrides: Partial<ISmtpClient> = {}): ISmtpClient {
        return {
            hostname: 'client.example.com',
            exchange: 'mx.example.com',
            secureTransport: true,
            startSession: jest.fn().mockResolvedValue(undefined),
            mailFrom: jest.fn().mockResolvedValue(undefined),
            rcptTo: jest.fn(),
            quit: jest.fn().mockResolvedValue(undefined),
            end: jest.fn(),
            ...overrides,
        } as unknown as ISmtpClient
    }

    it('records conclusive positive evidence for a target 250 and debits no evidence from a later successful QUIT', async () => {
        const client = fakeClient({
            rcptTo: jest.fn().mockResolvedValue({ code: 250, enhancedCode: '', message: 'OK', lines: [], capabilities: [] }),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            evidence: acceptedEvidence(),
        })
        expect(client.quit).toHaveBeenCalledTimes(1)
    })

    it('preserves an accepted recipient answer even when QUIT rejects afterward', async () => {
        const client = fakeClient({
            rcptTo: jest.fn().mockResolvedValue({ code: 250, enhancedCode: '', message: 'OK', lines: [], capabilities: [] }),
            quit: jest.fn().mockRejectedValue(new Error('connection reset')),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
            evidence: acceptedEvidence(),
        })
    })

    it('records conclusive missing-recipient evidence for a target 550 5.1.1', async () => {
        const client = fakeClient({
            rcptTo: jest
                .fn()
                .mockRejectedValue(
                    new SmtpException({
                        code: 550,
                        enhancedCode: '5.1.1',
                        message: 'no such user',
                        targetExchange: 'mx.example.com',
                        commandKind: 'rcpt_to',
                    }),
                ),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: false,
            reason: SmtpVerificationReason.RejectedEmail,
            targetExchange: 'mx.example.com',
            evidence: missingEvidence(),
        })
        expect(client.quit).toHaveBeenCalledTimes(1)
    })

    it('preserves a missing-recipient answer even when the peer closes before QUIT completes', async () => {
        const client = fakeClient({
            rcptTo: jest
                .fn()
                .mockRejectedValue(
                    new SmtpException({
                        code: 550,
                        enhancedCode: '5.1.1',
                        message: 'no such user',
                        targetExchange: 'mx.example.com',
                        commandKind: 'rcpt_to',
                    }),
                ),
            quit: jest.fn().mockRejectedValue(new Error('socket closed')),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: false,
            reason: SmtpVerificationReason.RejectedEmail,
            targetExchange: 'mx.example.com',
            evidence: missingEvidence(),
        })
    })

    it('treats a generic RCPT TO rejection with a different enhanced status as ineligible, not conclusive', async () => {
        const client = fakeClient({
            rcptTo: jest
                .fn()
                .mockRejectedValue(
                    new SmtpException({
                        code: 550,
                        enhancedCode: '5.7.1',
                        message: 'recipient policy violation',
                        targetExchange: 'mx.example.com',
                        commandKind: 'rcpt_to',
                    }),
                ),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.UnexpectedError,
            targetExchange: 'mx.example.com',
            evidence: NO_MAILBOX_EVIDENCE,
        })
    })

    it('does not treat the same 550 5.1.1 rejection at MAIL FROM as conclusive', async () => {
        const client = fakeClient({
            mailFrom: jest
                .fn()
                .mockRejectedValue(
                    new SmtpException({
                        code: 550,
                        enhancedCode: '5.1.1',
                        message: 'sender rejected',
                        targetExchange: 'mx.example.com',
                        commandKind: 'mail_from',
                    }),
                ),
        })

        await expect(internals.tryVerify({ client, email })).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.UnexpectedError,
            targetExchange: 'mx.example.com',
            evidence: NO_MAILBOX_EVIDENCE,
        })
        expect(client.rcptTo).not.toHaveBeenCalled()
    })

    it('retries repeated secure-transport failures instead of caching them as mailbox outcomes', async () => {
        const allocation = createAllocation('proxy-id')
        const cachedFailure = {
            organizationId,
            id: email,
            exists: null,
            reason: SmtpVerificationReason.SecureTransportUnavailable,
            secureTransport: false,
            evidenceObservedAt: null,
            evidencePolicyVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        const result = {
            email,
            exists: null,
            reason: SmtpVerificationReason.SecureTransportUnavailable,
            targetExchange: 'mx.example.com',
            evidence: NO_MAILBOX_EVIDENCE,
        }
        smtpVerificationStore.findByAddress.mockResolvedValue(cachedFailure)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({
            leasedClient: { client: { secureTransport: false }, allocation },
            attemptedConnection: true,
        })
        internals.tryVerify = jest.fn().mockResolvedValue(result)
        proxyAllocator.release.mockResolvedValue(true)

        await expect(probe.probe(organizationId, email)).resolves.toEqual(result)
        await expect(probe.probe(organizationId, email)).resolves.toEqual(result)

        expect(internals.getSmtpClient).toHaveBeenCalledTimes(2)
        expect(internals.tryVerify).toHaveBeenCalledTimes(2)
        expect(smtpVerificationStore.upsert).toHaveBeenCalledTimes(2)
        expect(proxyAllocator.release).toHaveBeenCalledTimes(2)
    })

    it('resolves MX exchanges through the injected MxResolver port', async () => {
        mxResolver.resolve.mockResolvedValue(['mx.example.com'])

        await expect(internals.getExchanges({ domain: 'example.com' })).resolves.toEqual(['mx.example.com'])
        expect(mxResolver.resolve).toHaveBeenCalledWith('example.com')
    })
})

function createAllocation(proxyId: string): LeasedProxy {
    return {
        proxy: {
            id: proxyId,
            type: 'http',
            host: `${proxyId}.example.com`,
            port: 8080,
        } satisfies IProxy,
        lease: {
            id: `lease-${proxyId}`,
            proxyId,
            mxHost: 'mx.example.com',
            expiresAt: new Date(),
        },
    }
}
