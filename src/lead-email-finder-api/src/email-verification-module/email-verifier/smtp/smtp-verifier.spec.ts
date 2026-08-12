import { SmtpVerifier } from './smtp-verifier'
import { SmtpVerificationReason } from './smtp.enums'
import { IProxy } from '@tuposoft/lead-email-finder/common'
import { LeasedProxy, ProxyAllocatorService } from '../../../../../proxy/src/proxy-allocator.service'

interface SmtpVerifierInternals {
    tryConnect: jest.Mock
    getExchanges: jest.Mock
    getSmtpClient: jest.Mock
    tryVerify: jest.Mock
}

describe('SmtpVerifier lease-aware allocation', () => {
    let verifier: SmtpVerifier
    let internals: SmtpVerifierInternals
    let proxyAllocator: { acquire: jest.Mock; release: jest.Mock }
    let smtpVerificationRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock }

    beforeEach(() => {
        proxyAllocator = { acquire: jest.fn(), release: jest.fn() }
        smtpVerificationRepo = { findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() }
        verifier = new SmtpVerifier(
            { resolve: jest.fn() } as any,
            { addToBlacklist: jest.fn() } as any,
            proxyAllocator as unknown as ProxyAllocatorService,
            smtpVerificationRepo as any,
        )
        internals = verifier as unknown as SmtpVerifierInternals
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
    })

    it('returns an unknown result when no lease can be allocated', async () => {
        proxyAllocator.acquire.mockResolvedValue(undefined)
        smtpVerificationRepo.findOneBy.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(verifier.verify('person@example.com')).resolves.toEqual({
            email: 'person@example.com',
            exists: null,
            reason: SmtpVerificationReason.Unknown,
        })
    })

    it('returns an unknown result when lease allocation is unavailable', async () => {
        proxyAllocator.acquire.mockRejectedValue(new Error('Redis unavailable'))
        smtpVerificationRepo.findOneBy.mockResolvedValue(null)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])

        await expect(verifier.verify('person@example.com')).resolves.toEqual({
            email: 'person@example.com',
            exists: null,
            reason: SmtpVerificationReason.Unknown,
        })
    })

    it('releases the selected allocation after SMTP verification completes', async () => {
        const allocation = createAllocation('proxy-id')
        const client = {} as any
        const result = {
            email: 'person@example.com',
            exists: true,
            reason: SmtpVerificationReason.AcceptedEmail,
        }
        smtpVerificationRepo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
        smtpVerificationRepo.create.mockReturnValue({ id: 'person@example.com' })
        smtpVerificationRepo.save.mockResolvedValue(undefined)
        internals.getExchanges = jest.fn().mockResolvedValue(['mx.example.com'])
        internals.getSmtpClient = jest.fn().mockResolvedValue({
            leasedClient: { client, allocation },
            attemptedConnection: true,
        })
        internals.tryVerify = jest.fn().mockResolvedValue(result)
        proxyAllocator.release.mockResolvedValue(true)

        await expect(verifier.verify('person@example.com')).resolves.toEqual(result)
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
