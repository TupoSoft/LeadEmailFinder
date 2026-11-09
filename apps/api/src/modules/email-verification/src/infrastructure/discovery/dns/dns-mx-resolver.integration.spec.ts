import { DnsService } from '@tuposoft/lead-email-finder/dns'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Redis } from 'ioredis'
import { resolveMx } from 'node:dns/promises'
import { DnsMxResolver } from './dns-mx-resolver'

jest.mock('node:dns/promises', () => ({ resolveMx: jest.fn(), reverse: jest.fn() }))

describe('DnsMxResolver DNS contract', () => {
    const resolveMxMock = jest.mocked(resolveMx)
    let redis: Pick<jest.Mocked<Redis>, 'get' | 'set'>
    let resolver: DnsMxResolver
    let moduleRef: TestingModule

    beforeEach(async () => {
        jest.resetAllMocks()
        redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') }
        moduleRef = await Test.createTestingModule({
            providers: [
                DnsService,
                { provide: Redis, useValue: redis },
                { provide: Logger, useValue: { debug: jest.fn() } },
            ],
        }).compile()
        resolver = new DnsMxResolver(moduleRef.get(DnsService))
    })

    afterEach(async () => moduleRef.close())

    it('uses the existing DNS priority order, domain normalization, and cache policy', async () => {
        resolveMxMock.mockResolvedValueOnce([
            { exchange: 'mx2.example.com', priority: 20 },
            { exchange: 'mx1.example.com', priority: 10 },
        ])

        await expect(resolver.resolve('EXAMPLE.COM')).resolves.toEqual(['mx1.example.com', 'mx2.example.com'])
        expect(resolveMxMock).toHaveBeenCalledWith('example.com')
        expect(resolveMxMock).toHaveBeenCalledTimes(1)
        expect(redis.set).toHaveBeenCalledWith(
            'DNS_CACHE:MX:example.com',
            JSON.stringify([
                { exchange: 'mx1.example.com', priority: 10 },
                { exchange: 'mx2.example.com', priority: 20 },
            ]),
            'EX',
            DnsService.DEFAULT_TTL_SECONDS,
        )
    })

    it('returns cached exchange order without another DNS request', async () => {
        redis.get.mockResolvedValueOnce(JSON.stringify([{ exchange: 'cached.example.com', priority: 10 }]))

        await expect(resolver.resolve('example.com')).resolves.toEqual(['cached.example.com'])
        expect(resolveMxMock).not.toHaveBeenCalled()
        expect(redis.set).not.toHaveBeenCalled()
    })

    it.each(['ENODATA', 'ENOTFOUND', 'ETIMEOUT', 'SERVFAIL'])(
        'preserves no-record mapping without retry when DNS rejects with %s',
        async code => {
            resolveMxMock.mockRejectedValueOnce(Object.assign(new Error('remote DNS sentinel'), { code }))

            await expect(resolver.resolve('example.com')).resolves.toEqual([])
            expect(resolveMxMock).toHaveBeenCalledTimes(1)
            expect(redis.set).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                '[]',
                'EX',
                DnsService.DEFAULT_TTL_SECONDS,
            )
        },
    )

    it.each(['cache read', 'cache write', 'malformed cache'])(
        'preserves %s failure rejection while removing external messages and details',
        async failure => {
            const sentinel = 'unique-person@private.example'
            const error = Object.assign(new Error(`redis://credential@host/${encodeURIComponent(sentinel)}`), {
                address: sentinel,
            })
            if (failure === 'cache read') redis.get.mockRejectedValueOnce(error)
            if (failure === 'cache write') {
                resolveMxMock.mockResolvedValueOnce([])
                redis.set.mockRejectedValueOnce(error)
            }
            if (failure === 'malformed cache') redis.get.mockResolvedValueOnce(sentinel)

            const result = await resolver.resolve('example.com').catch((reason: unknown) => reason)

            expect(result).toEqual(new Error('dns_mx_resolution_failed'))
            expect((result as Error).cause).toBeUndefined()
            expect(String(result)).not.toContain(sentinel)
            expect(String(result)).not.toContain(encodeURIComponent(sentinel))
            expect(JSON.stringify(result)).not.toContain('credential')
        },
    )
})
