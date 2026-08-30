import { Test } from '@nestjs/testing'
import { Redis } from 'ioredis'
import { RedisProxyLeaseStore } from './redis-proxy-lease-store'

describe('RedisProxyLeaseStore', () => {
    let store: RedisProxyLeaseStore
    let redis: { eval: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [RedisProxyLeaseStore, { provide: Redis, useValue: { eval: jest.fn() } }],
        }).compile()

        store = moduleRef.get(RedisProxyLeaseStore)
        redis = moduleRef.get(Redis)
    })

    it('acquires a lease while enforcing egress and MX limits atomically', async () => {
        redis.eval.mockResolvedValue(1)

        const acquired = await store.tryAcquire({
            leaseId: 'lease-id',
            proxyId: 'proxy-id',
            mxHost: 'mx.example.com',
            now: 1_700_000_000_000,
            leaseTtlMs: 60_000,
            maxConcurrent: 1,
            proxyRequestsPerMinute: 10,
            mxRequestsPerMinute: 10,
        })

        expect(acquired).toBe(true)
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining('ZREMRANGEBYSCORE'),
            4,
            expect.stringContaining('proxy:leases:'),
            expect.stringContaining('proxy:rate:'),
            expect.stringContaining('proxy:mx-rate:'),
            expect.stringContaining('proxy:lease:'),
            '1700000000000',
            '60000',
            '1',
            '10',
            '10',
            expect.any(String),
            'lease-id',
            'proxy-id',
        )
    })

    it('returns false when Redis rejects capacity acquisition', async () => {
        redis.eval.mockResolvedValue(0)

        await expect(
            store.tryAcquire({
                leaseId: 'lease-id',
                proxyId: 'proxy-id',
                mxHost: 'mx.example.com',
                now: Date.now(),
                leaseTtlMs: 60_000,
                maxConcurrent: 1,
                proxyRequestsPerMinute: 10,
                mxRequestsPerMinute: 10,
            }),
        ).resolves.toBe(false)
    })

    it('releases a lease once and treats an expired lease as already released', async () => {
        redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

        await expect(store.release('proxy-id', 'mx.example.com', 'lease-id')).resolves.toBe(true)
        await expect(store.release('proxy-id', 'mx.example.com', 'lease-id')).resolves.toBe(false)
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining('ZREM'),
            2,
            expect.stringContaining('proxy:leases:'),
            expect.stringContaining('proxy:lease:'),
            'lease-id',
        )
    })
})
