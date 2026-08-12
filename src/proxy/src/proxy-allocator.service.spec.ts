import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProxyLifecycle, ProxyProtocol } from './proxy.dto'
import { Proxy } from './proxy.entity'
import { ProxyAllocatorService } from './proxy-allocator.service'
import { ProxyLeaseService } from './proxy-lease.service'

describe('ProxyAllocatorService', () => {
    let service: ProxyAllocatorService
    let proxyRepo: { createQueryBuilder: jest.Mock; findOneBy: jest.Mock }
    let proxyLeaseService: { acquire: jest.Mock; release: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProxyAllocatorService,
                {
                    provide: getRepositoryToken(Proxy),
                    useValue: {
                        createQueryBuilder: jest.fn(),
                        findOneBy: jest.fn(),
                    },
                },
                {
                    provide: ProxyLeaseService,
                    useValue: {
                        acquire: jest.fn(),
                        release: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = moduleRef.get(ProxyAllocatorService)
        proxyRepo = moduleRef.get(getRepositoryToken(Proxy))
        proxyLeaseService = moduleRef.get(ProxyLeaseService)
    })

    it('leases an active, non-blacklisted proxy for an MX host', async () => {
        const proxy = createProxy()
        const getMany = jest.fn().mockResolvedValue([proxy])
        const andWhere = jest.fn().mockReturnValue({ getMany })
        const where = jest.fn().mockReturnValue({ andWhere })
        proxyRepo.createQueryBuilder.mockReturnValue({ where })
        proxyLeaseService.acquire.mockResolvedValue(createLease())

        await expect(service.acquire('mx.example.com')).resolves.toEqual({
            proxy: expect.objectContaining({ id: proxy.id, type: 'http' }),
            lease: expect.objectContaining({ proxyId: proxy.id, mxHost: 'mx.example.com' }),
        })
        expect(where).toHaveBeenCalledWith('proxy.state = :state', { state: ProxyLifecycle.ACTIVE })
        expect(andWhere).toHaveBeenCalledWith(
            '(proxy.blacklists IS NULL OR NOT (:mxHost = ANY(proxy.blacklists)))',
            { mxHost: 'mx.example.com' },
        )
        expect(proxyLeaseService.acquire).toHaveBeenCalledWith({
            proxyId: proxy.id,
            mxHost: 'mx.example.com',
            maxConcurrent: 1,
            requestsPerMinute: 10,
        })
    })

    it('tries the next weighted candidate when a proxy has no available capacity', async () => {
        const first = createProxy({ id: 'first-proxy', weight: 0 })
        const second = createProxy({ id: 'second-proxy', weight: 0 })
        const getMany = jest.fn().mockResolvedValue([first, second])
        const andWhere = jest.fn().mockReturnValue({ getMany })
        const where = jest.fn().mockReturnValue({ andWhere })
        proxyRepo.createQueryBuilder.mockReturnValue({ where })
        proxyLeaseService.acquire.mockResolvedValueOnce(undefined).mockResolvedValueOnce(createLease({ proxyId: second.id }))

        await expect(service.acquire('mx.example.com')).resolves.toEqual(
            expect.objectContaining({ proxy: expect.objectContaining({ id: second.id }) }),
        )
        expect(proxyLeaseService.acquire).toHaveBeenNthCalledWith(1, expect.objectContaining({ proxyId: first.id }))
        expect(proxyLeaseService.acquire).toHaveBeenNthCalledWith(2, expect.objectContaining({ proxyId: second.id }))
    })

    it('only leases an explicitly requested active proxy that is not blacklisted', async () => {
        const proxy = createProxy({ id: 'requested-proxy' })
        proxyRepo.findOneBy.mockResolvedValue(proxy)
        proxyLeaseService.acquire.mockResolvedValue(createLease({ proxyId: proxy.id }))

        await expect(service.acquire('mx.example.com', proxy.id)).resolves.toEqual(
            expect.objectContaining({ proxy: expect.objectContaining({ id: proxy.id }) }),
        )
        expect(proxyRepo.findOneBy).toHaveBeenCalledWith({ id: proxy.id, state: ProxyLifecycle.ACTIVE })
    })

    it('does not lease an explicitly requested blacklisted proxy', async () => {
        const proxy = createProxy({ blacklists: ['mx.example.com'] })
        proxyRepo.findOneBy.mockResolvedValue(proxy)

        await expect(service.acquire('mx.example.com', proxy.id)).resolves.toBeUndefined()
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

function createProxy(overrides: Partial<Proxy> = {}): Proxy {
    return {
        id: 'proxy-id',
        protocol: ProxyProtocol.HTTP,
        host: 'proxy.example.com',
        port: 8080,
        state: ProxyLifecycle.ACTIVE,
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        ...overrides,
    } as Proxy
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
