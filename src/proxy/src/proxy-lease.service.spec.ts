import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { Redis } from 'ioredis'
import { ProxyLeaseService } from './proxy-lease.service'

describe('ProxyLeaseService', () => {
    let service: ProxyLeaseService
    let redis: { eval: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                ProxyLeaseService,
                {
                    provide: Redis,
                    useValue: { eval: jest.fn() },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => ({
                            PROXY_MX_REQUESTS_PER_MINUTE: 10,
                            PROXY_LEASE_TTL_MS: 60_000,
                        } as Record<string, number>)[key]),
                    },
                },
            ],
        }).compile()

        service = moduleRef.get(ProxyLeaseService)
        redis = moduleRef.get(Redis)
    })

    it('acquires a lease while enforcing egress and MX limits atomically', async () => {
        redis.eval.mockResolvedValue(1)

        const lease = await service.acquire({
            proxyId: 'proxy-id',
            mxHost: 'mx.example.com',
            maxConcurrent: 1,
            requestsPerMinute: 10,
        })

        expect(lease).toEqual(
            expect.objectContaining({
                proxyId: 'proxy-id',
                mxHost: 'mx.example.com',
                id: expect.any(String),
                expiresAt: expect.any(Date),
            }),
        )
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining('ZREMRANGEBYSCORE'),
            4,
            expect.stringContaining('proxy:leases:'),
            expect.stringContaining('proxy:rate:'),
            expect.stringContaining('proxy:mx-rate:'),
            expect.stringContaining('proxy:lease:'),
            expect.any(String),
            '60000',
            '1',
            '10',
            '10',
            expect.any(String),
            expect.any(String),
            'proxy-id',
        )
    })

    it('returns no lease when Redis rejects capacity acquisition', async () => {
        redis.eval.mockResolvedValue(0)

        await expect(
            service.acquire({
                proxyId: 'proxy-id',
                mxHost: 'mx.example.com',
                maxConcurrent: 1,
                requestsPerMinute: 10,
            }),
        ).resolves.toBeUndefined()
    })

    it('releases a lease once and treats an expired lease as already released', async () => {
        redis.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
        const lease = {
            id: 'lease-id',
            proxyId: 'proxy-id',
            mxHost: 'mx.example.com',
            expiresAt: new Date(),
        }

        await expect(service.release(lease)).resolves.toBe(true)
        await expect(service.release(lease)).resolves.toBe(false)
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining('ZREM'),
            2,
            expect.stringContaining('proxy:leases:'),
            expect.stringContaining('proxy:lease:'),
            'lease-id',
        )
    })
})
