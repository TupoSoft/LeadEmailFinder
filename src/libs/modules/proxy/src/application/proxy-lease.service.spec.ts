import { ProxyLeaseStore } from './ports/proxy-lease-store'
import { ProxyLeaseService } from './proxy-lease.service'

describe('ProxyLeaseService', () => {
    let store: jest.Mocked<ProxyLeaseStore>
    let service: ProxyLeaseService

    beforeEach(() => {
        store = { tryAcquire: jest.fn(), release: jest.fn() }
        service = new ProxyLeaseService(store, 10, 60_000)
    })

    it('acquires a lease and computes its expiry from the configured TTL', async () => {
        store.tryAcquire.mockResolvedValue(true)

        const lease = await service.acquire({
            proxyId: 'proxy-id',
            mxHost: 'mx.example.com',
            maxConcurrent: 1,
            requestsPerMinute: 10,
        })

        expect(lease).toEqual(
            expect.objectContaining({ proxyId: 'proxy-id', mxHost: 'mx.example.com', id: expect.any(String) }),
        )
        expect(store.tryAcquire).toHaveBeenCalledWith(
            expect.objectContaining({
                proxyId: 'proxy-id',
                mxHost: 'mx.example.com',
                leaseTtlMs: 60_000,
                maxConcurrent: 1,
                proxyRequestsPerMinute: 10,
                mxRequestsPerMinute: 10,
            }),
        )
    })

    it('returns no lease when the store rejects capacity acquisition', async () => {
        store.tryAcquire.mockResolvedValue(false)

        await expect(
            service.acquire({ proxyId: 'proxy-id', mxHost: 'mx.example.com', maxConcurrent: 1, requestsPerMinute: 10 }),
        ).resolves.toBeUndefined()
    })

    it('releases a lease through the store', async () => {
        store.release.mockResolvedValue(true)
        const lease = { id: 'lease-id', proxyId: 'proxy-id', mxHost: 'mx.example.com', expiresAt: new Date() }

        await expect(service.release(lease)).resolves.toBe(true)
        expect(store.release).toHaveBeenCalledWith('proxy-id', 'mx.example.com', 'lease-id')
    })
})
