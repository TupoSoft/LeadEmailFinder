import { SmtpVerifier } from './smtp-verifier'
import { SmtpVerificationReason } from './smtp.enums'
import { IAllocationObserver, IProxy, IProxyAllocator, LeasedProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { ISmtpClient } from './smtp-client.interface'
import { Logger } from '@nestjs/common'

interface SmtpVerifierInternals {
    tryConnect: jest.Mock
    getExchanges: jest.Mock
    getSmtpClient: jest.Mock
    tryVerify: jest.Mock
}

const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const otherOrganizationId = '3dc5deaf-c1f0-4b48-a0dc-caa8504f3a78'
const email = 'person@example.com'

describe('SmtpVerifier', () => {
    let verifier: SmtpVerifier
    let internals: SmtpVerifierInternals
    let proxyAllocator: { acquire: jest.Mock; release: jest.Mock }
    let smtpClientFactory: { create: jest.Mock }
    let smtpVerificationRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock }
    let allocationObserver: { onAllocation: jest.Mock; onConnectionOutcome: jest.Mock; onLeaseRelease: jest.Mock }
    let loggerErrorSpy: jest.SpiedFunction<Logger['error']>

    beforeEach(() => {
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
        proxyAllocator = { acquire: jest.fn(), release: jest.fn() }
        smtpClientFactory = { create: jest.fn() }
        smtpVerificationRepo = { findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() }
        allocationObserver = { onAllocation: jest.fn(), onConnectionOutcome: jest.fn(), onLeaseRelease: jest.fn() }
        verifier = new SmtpVerifier(
            { resolve: jest.fn() } as any,
            { addToBlacklist: jest.fn() } as any,
            proxyAllocator as unknown as IProxyAllocator,
            smtpClientFactory,
            smtpVerificationRepo as any,
            allocationObserver as unknown as IAllocationObserver,
        )
        internals = verifier as unknown as SmtpVerifierInternals
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
        smtpVerificationRepo.findOneBy.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(verifier.verify(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
        })
        expect(smtpVerificationRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
    })

    it('returns an unknown result without logging a remote allocation error message', async () => {
        const sentinel = 'unique-person@private.example'
        const remoteError = new Error(`Redis unavailable for ${sentinel}`)
        Object.defineProperty(remoteError, 'constructor', { value: { name: sentinel } })
        proxyAllocator.acquire.mockRejectedValue(remoteError)
        smtpVerificationRepo.findOneBy.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(verifier.verify(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
        })
        expect(loggerErrorSpy).toHaveBeenCalledWith('smtp_connection_failed', { errorClass: 'Error' })
        expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain(sentinel)
    })

    it('returns a conclusive result only from the requesting organization cache', async () => {
        smtpVerificationRepo.findOneBy.mockImplementation(({ organizationId: requestedOrganizationId }) => {
            if (requestedOrganizationId !== organizationId) return null

            return {
                organizationId,
                id: email,
                exists: true,
                reason: SmtpVerificationReason.AcceptedEmail,
                targetExchange: 'mx.example.com',
            }
        })
        internals.getExchanges = jest.fn().mockResolvedValue([])

        await expect(verifier.verify(organizationId, email)).resolves.toEqual({
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
            targetExchange: 'mx.example.com',
        })
        await expect(verifier.verify(otherOrganizationId, email)).resolves.toEqual({
            email,
            exists: false,
            reason: SmtpVerificationReason.NoMxRecords,
        })

        expect(smtpVerificationRepo.findOneBy).toHaveBeenNthCalledWith(1, { organizationId, id: email })
        expect(smtpVerificationRepo.findOneBy).toHaveBeenNthCalledWith(2, {
            organizationId: otherOrganizationId,
            id: email,
        })
        expect(internals.getExchanges).toHaveBeenCalledTimes(1)
    })

    it('reuses temporarily blocked connection hints only from the requesting organization cache', async () => {
        smtpVerificationRepo.findOneBy.mockResolvedValue({
            organizationId,
            id: email,
            exists: null,
            reason: SmtpVerificationReason.TemporarilyBlocked,
            targetExchange: 'mx.example.com',
            proxyId: 'proxy-id',
        })
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({ attemptedConnection: false })

        await expect(verifier.verify(organizationId, email)).resolves.toEqual({
            email,
            exists: null,
            reason: SmtpVerificationReason.Unknown,
        })

        expect(smtpVerificationRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
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
        const client = {} as any
        const result = {
            email,
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
        }
        smtpVerificationRepo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
        smtpVerificationRepo.create.mockReturnValue({ organizationId, id: email })
        smtpVerificationRepo.save.mockResolvedValue(undefined)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({
            leasedClient: { client, allocation },
            attemptedConnection: true,
        })
        internals.tryVerify = jest.fn().mockResolvedValue(result)
        proxyAllocator.release.mockResolvedValue(true)

        await expect(verifier.verify(organizationId, email)).resolves.toEqual(result)
        expect(smtpVerificationRepo.findOneBy).toHaveBeenNthCalledWith(1, { organizationId, id: email })
        expect(smtpVerificationRepo.findOneBy).toHaveBeenNthCalledWith(2, { organizationId, id: email })
        expect(smtpVerificationRepo.create).toHaveBeenCalledWith({ organizationId, id: email })
        expect(smtpVerificationRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId,
                id: email,
                exists: true,
                reason: SmtpVerificationReason.AcceptedEmail,
            }),
        )
        expect(proxyAllocator.release).toHaveBeenCalledWith(allocation)
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
