import { Test } from '@nestjs/testing'
import { ProxyAllocatorService } from './proxy-allocator.service'
import {
    ALLOCATION_OBSERVER_TOKEN,
    IAllocationObserver,
    IProxy,
    IProxyLeaseService,
    PROXY_LEASE_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'
import {
    PROXY_CANDIDATE_REPOSITORY_TOKEN,
    ProxyCandidate,
    ProxyCandidateRepository,
} from './proxy-candidate.repository'

describe('ProxyAllocatorService', () => {
    let service: ProxyAllocatorService
    let candidateRepository: { findEligible: jest.Mock; findActiveById: jest.Mock }
    let proxyLeaseService: { acquire: jest.Mock; release: jest.Mock }
    let observer: { onAllocation: jest.Mock; onConnectionOutcome: jest.Mock; onLeaseRelease: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProxyAllocatorService,
                {
                    provide: PROXY_CANDIDATE_REPOSITORY_TOKEN,
                    useValue: {
                        findEligible: jest.fn(),
                        findActiveById: jest.fn(),
                    },
                },
                {
                    provide: PROXY_LEASE_SERVICE_TOKEN,
                    useValue: {
                        acquire: jest.fn(),
                        release: jest.fn(),
                    },
                },
                {
                    provide: ALLOCATION_OBSERVER_TOKEN,
                    useValue: {
                        onAllocation: jest.fn(),
                        onConnectionOutcome: jest.fn(),
                        onLeaseRelease: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = moduleRef.get(ProxyAllocatorService)
        candidateRepository = moduleRef.get<ProxyCandidateRepository>(PROXY_CANDIDATE_REPOSITORY_TOKEN) as {
            findEligible: jest.Mock
            findActiveById: jest.Mock
        }
        proxyLeaseService = moduleRef.get<IProxyLeaseService>(PROXY_LEASE_SERVICE_TOKEN) as {
            acquire: jest.Mock
            release: jest.Mock
        }
        observer = moduleRef.get<IAllocationObserver>(ALLOCATION_OBSERVER_TOKEN) as {
            onAllocation: jest.Mock
            onConnectionOutcome: jest.Mock
            onLeaseRelease: jest.Mock
        }
    })

    it('leases an active, non-blacklisted proxy for an MX host', async () => {
        const candidate = createCandidate()
        candidateRepository.findEligible.mockResolvedValue([candidate])
        proxyLeaseService.acquire.mockResolvedValue(createLease())

        await expect(service.acquire('mx.example.com')).resolves.toEqual({
            proxy: candidate.proxy,
            lease: expect.objectContaining({ proxyId: candidate.proxy.id, mxHost: 'mx.example.com' }),
        })
        expect(candidateRepository.findEligible).toHaveBeenCalledWith('mx.example.com', [])
        expect(proxyLeaseService.acquire).toHaveBeenCalledWith({
            proxyId: candidate.proxy.id,
            mxHost: 'mx.example.com',
            maxConcurrent: 1,
            requestsPerMinute: 10,
        })
        expect(observer.onAllocation).toHaveBeenCalledWith(
            expect.objectContaining({
                outcome: 'acquired',
                mxHost: 'mx.example.com',
                proxyId: candidate.proxy.id,
                proxyState: 'active',
            }),
        )
    })

    it('reports exhaustion when no candidate can be leased', async () => {
        candidateRepository.findEligible.mockResolvedValue([])

        await expect(service.acquire('mx.example.com')).resolves.toBeUndefined()

        expect(observer.onAllocation).toHaveBeenCalledWith(
            expect.objectContaining({ outcome: 'exhausted', mxHost: 'mx.example.com' }),
        )
    })

    it('tries the next weighted candidate when a proxy has no available capacity', async () => {
        const first = createCandidate({ proxy: createProxy('first-proxy'), weight: 0 })
        const second = createCandidate({ proxy: createProxy('second-proxy'), weight: 0 })
        candidateRepository.findEligible.mockResolvedValue([first, second])
        proxyLeaseService.acquire.mockResolvedValueOnce(undefined).mockResolvedValueOnce(
            createLease({ proxyId: second.proxy.id }),
        )

        await expect(service.acquire('mx.example.com')).resolves.toEqual(
            expect.objectContaining({ proxy: expect.objectContaining({ id: second.proxy.id }) }),
        )
        expect(proxyLeaseService.acquire).toHaveBeenNthCalledWith(1, expect.objectContaining({ proxyId: first.proxy.id }))
        expect(proxyLeaseService.acquire).toHaveBeenNthCalledWith(2, expect.objectContaining({ proxyId: second.proxy.id }))
    })

    it('only leases an explicitly requested active proxy that is not blacklisted', async () => {
        const candidate = createCandidate({ proxy: createProxy('requested-proxy') })
        candidateRepository.findActiveById.mockResolvedValue(candidate)
        proxyLeaseService.acquire.mockResolvedValue(createLease({ proxyId: candidate.proxy.id }))

        await expect(service.acquire('mx.example.com', candidate.proxy.id)).resolves.toEqual(
            expect.objectContaining({ proxy: expect.objectContaining({ id: candidate.proxy.id }) }),
        )
        expect(candidateRepository.findActiveById).toHaveBeenCalledWith('mx.example.com', candidate.proxy.id)
    })

    it('does not lease an explicitly requested blacklisted proxy', async () => {
        candidateRepository.findActiveById.mockResolvedValue(undefined)

        await expect(service.acquire('mx.example.com', 'proxy-id')).resolves.toBeUndefined()
        expect(proxyLeaseService.acquire).not.toHaveBeenCalled()
    })

    it('releases the underlying lease', async () => {
        const allocation = {
            proxy: { id: 'proxy-id' },
            lease: createLease(),
        } as Awaited<ReturnType<ProxyAllocatorService['acquire']>>
        proxyLeaseService.release.mockResolvedValue(true)

        await expect(service.release(allocation!)).resolves.toBe(true)
        expect(proxyLeaseService.release).toHaveBeenCalledWith(allocation!.lease)
        expect(observer.onLeaseRelease).toHaveBeenCalledWith(
            expect.objectContaining({ outcome: 'released', proxyId: 'proxy-id', mxHost: 'mx.example.com' }),
        )
    })

    it('reports a failed release outcome when the lease service reports failure', async () => {
        const allocation = {
            proxy: { id: 'proxy-id' },
            lease: createLease(),
        } as Awaited<ReturnType<ProxyAllocatorService['acquire']>>
        proxyLeaseService.release.mockResolvedValue(false)

        await expect(service.release(allocation!)).resolves.toBe(false)
        expect(observer.onLeaseRelease).toHaveBeenCalledWith(
            expect.objectContaining({ outcome: 'failed', proxyId: 'proxy-id', mxHost: 'mx.example.com' }),
        )
    })
})

function createCandidate(overrides: Partial<ProxyCandidate> = {}): ProxyCandidate {
    return {
        proxy: createProxy('proxy-id'),
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        ...overrides,
    }
}

function createProxy(id: string): IProxy {
    return {
        id,
        type: 'http' as const,
        host: `${id}.example.com`,
        port: 8080,
    }
}

function createLease(overrides: Partial<{ id: string; proxyId: string; mxHost: string; expiresAt: Date }> = {}): {
    id: string
    proxyId: string
    mxHost: string
    expiresAt: Date
} {
    return {
        id: 'lease-id',
        proxyId: 'proxy-id',
        mxHost: 'mx.example.com',
        expiresAt: new Date(),
        ...overrides,
    }
}
