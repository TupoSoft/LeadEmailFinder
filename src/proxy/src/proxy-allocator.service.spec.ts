import { Test } from '@nestjs/testing'
import { ProxyAllocatorService } from './proxy-allocator.service'
import { IProxy, IProxyLeaseService, PROXY_LEASE_SERVICE_TOKEN } from '@tuposoft/lead-email-finder/common'
import {
    PROXY_CANDIDATE_REPOSITORY_TOKEN,
    ProxyCandidate,
    ProxyCandidateRepository,
} from './proxy-candidate.repository'

describe('ProxyAllocatorService', () => {
    let service: ProxyAllocatorService
    let candidateRepository: { findEligible: jest.Mock; findActiveById: jest.Mock }
    let proxyLeaseService: { acquire: jest.Mock; release: jest.Mock }

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
