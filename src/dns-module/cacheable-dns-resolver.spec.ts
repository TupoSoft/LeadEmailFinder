import { CacheableDnsResolver } from './cacheable-dns-resolver'
import { Redis } from 'ioredis'
import { resolveMx, reverse } from 'node:dns/promises'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { DNSTypeMap } from './util'

jest.mock('node:dns/promises')

jest.mock('node:console', () => ({
    log: jest.fn(),
    debug: jest.fn(),
}))

jest.mock('ioredis', () => ({
    Redis: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
    })),
}))

describe('DNSCacheImpl', () => {
    const redisClient = new Redis() as jest.Mocked<Redis>

    const dnsCache = new CacheableDnsResolver(redisClient as Redis)

    const resolveMxMock = resolveMx as jest.Mock<typeof resolveMx>

    const reverseMock = reverse as jest.Mock<typeof reverse>

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('resolve', () => {
        it('should return cached records if present', async () => {
            const cachedMXRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            redisClient.get.mockResolvedValueOnce(JSON.stringify(cachedMXRecords))

            const result = await dnsCache.resolve('example.com', 'MX')

            expect(redisClient.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedMXRecords)
        })

        it('should fetch and cache records if not present in cache', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMxMock.mockResolvedValueOnce(mxRecords)

            redisClient.get.mockResolvedValueOnce(null) // No cache
            redisClient.set.mockResolvedValueOnce('OK')

            const result = await dnsCache.resolve('example.com', 'MX')

            expect(redisClient.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(redisClient.set).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(mxRecords),
                'EX',
                CacheableDnsResolver.DEFAULT_TTL_SECONDS,
            )
            expect(result).toEqual(mxRecords)
        })

        it('should use reverse lookup for PTR records', async () => {
            const ptrRecords: DNSTypeMap['PTR'] = ['example.com']
            reverseMock.mockResolvedValueOnce(ptrRecords)

            redisClient.get.mockResolvedValueOnce(null) // No cache
            redisClient.set.mockResolvedValueOnce('OK')

            const result = await dnsCache.resolve('192.0.2.1', 'PTR')

            expect(redisClient.get).toHaveBeenCalledWith('DNS_CACHE:PTR:192.0.2.1')
            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
            expect(redisClient.set).toHaveBeenCalledWith(
                'DNS_CACHE:PTR:192.0.2.1',
                JSON.stringify(ptrRecords),
                'EX',
                CacheableDnsResolver.DEFAULT_TTL_SECONDS,
            )
            expect(result).toEqual(ptrRecords)
        })
    })

    describe('getCachedRecords', () => {
        it('should return parsed cached data if present', async () => {
            const cachedData = [{ exchange: 'mail.example.com', priority: 10 }]
            redisClient.get.mockResolvedValueOnce(JSON.stringify(cachedData))

            // @ts-expect-error testing private method
            const result = await dnsCache.getCachedRecords('example.com', 'MX')

            expect(redisClient.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedData)
        })

        it('should return null if no cached data is present', async () => {
            redisClient.get.mockResolvedValueOnce(null)

            // @ts-expect-error testing private method
            const result = await dnsCache.getCachedRecords('example.com', 'MX')

            expect(redisClient.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toBeNull()
        })
    })

    describe('cacheRecords', () => {
        it('should cache records with TTL', async () => {
            const records = [{ exchange: 'mail.example.com', priority: 10 }]
            redisClient.set.mockResolvedValueOnce('OK')

            // @ts-expect-error testing private method
            await dnsCache.cacheRecords('example.com', 'MX', records)

            expect(redisClient.set).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(records),
                'EX',
                CacheableDnsResolver.DEFAULT_TTL_SECONDS,
            )
        })
    })
})
