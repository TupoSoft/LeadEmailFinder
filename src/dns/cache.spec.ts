import { DNSCacheImpl } from './cache' // Adjust the path as needed
import type { Redis } from 'ioredis'
import { resolveMx, reverse } from 'node:dns/promises'
import { describe, expect, it, jest } from '@jest/globals'
import { type DNSTypeMap, fetchMxRecords, fetchRecords } from './util'
import { afterEach } from 'node:test'

jest.mock('node:dns/promises', () => ({
    resolveMx: jest.fn(),
    reverse: jest.fn(),
}))

describe('DNSCacheImpl', () => {
    const redisClient = {
        get: jest.fn(),
        set: jest.fn(),
    } as unknown as jest.Mocked<Redis>

    const dnsCache = new DNSCacheImpl(redisClient, 3600)

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

            expect(redisClient.get.bind(redisClient)).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedMXRecords)
        })

        it('should fetch and cache records if not present in cache', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMxMock.mockResolvedValueOnce(mxRecords)

            redisClient.get.mockResolvedValueOnce(null) // No cache
            redisClient.set.mockResolvedValueOnce('OK')

            const result = await dnsCache.resolve('example.com', 'MX')

            expect(redisClient.get.bind(redisClient)).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(redisClient.set.bind(redisClient)).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(mxRecords),
                'EX',
                3600,
            )
            expect(result).toEqual(mxRecords)
        })

        it('should use reverse lookup for PTR records', async () => {
            const ptrRecords: DNSTypeMap['PTR'] = ['example.com']
            reverseMock.mockResolvedValueOnce(ptrRecords)

            redisClient.get.mockResolvedValueOnce(null) // No cache
            redisClient.set.mockResolvedValueOnce('OK')

            const result = await dnsCache.resolve('192.0.2.1', 'PTR')

            expect(redisClient.get.bind(redisClient)).toHaveBeenCalledWith('DNS_CACHE:PTR:192.0.2.1')
            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
            expect(redisClient.set.bind(redisClient)).toHaveBeenCalledWith(
                'DNS_CACHE:PTR:192.0.2.1',
                JSON.stringify(ptrRecords),
                'EX',
                3600,
            )
            expect(result).toEqual(ptrRecords)
        })
    })

    describe('getCachedRecords', () => {
        it('should return parsed cached data if present', async () => {
            const cachedData = [{ exchange: 'mail.example.com', priority: 10 }]
            redisClient.get.mockResolvedValueOnce(JSON.stringify(cachedData))

            // @ts-expect-error testing
            const result = await dnsCache.getCachedRecords('example.com', 'MX')

            expect(redisClient.get.bind(redisClient)).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedData)
        })

        it('should return null if no cached data is present', async () => {
            redisClient.get.mockResolvedValueOnce(null)

            // @ts-expect-error testing
            const result = await dnsCache.getCachedRecords('example.com', 'MX')

            expect(redisClient.get.bind(redisClient)).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toBeNull()
        })
    })

    describe('cacheRecords', () => {
        it('should cache records with TTL', async () => {
            const records = [{ exchange: 'mail.example.com', priority: 10 }]
            redisClient.set.mockResolvedValueOnce('OK')

            // @ts-expect-error testing
            await dnsCache.cacheRecords('example.com', 'MX', records)

            expect(redisClient.set.bind(redisClient)).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(records),
                'EX',
                3600,
            )
        })
    })

    describe('fetchRecords', () => {
        it('should fetch MX records', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMxMock.mockResolvedValueOnce(mxRecords)

            const result = await fetchRecords('example.com', 'MX')

            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(result).toEqual(mxRecords)
        })

        it('should fetch PTR records', async () => {
            const ptrRecords: DNSTypeMap['PTR'] = ['example.com']
            reverseMock.mockResolvedValueOnce(ptrRecords)

            const result = await fetchRecords('192.0.2.1', 'PTR')

            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
            expect(result).toEqual(ptrRecords)
        })
    })

    describe('fetchMxRecords', () => {
        it('should fetch and sort MX records by priority', async () => {
            const unsortedRecords = [
                { exchange: 'b.example.com', priority: 20 },
                { exchange: 'a.example.com', priority: 10 },
            ]

            const sortedRecords = [
                { exchange: 'a.example.com', priority: 10 },
                { exchange: 'b.example.com', priority: 20 },
            ]

            resolveMxMock.mockResolvedValueOnce(unsortedRecords)

            const result = await fetchMxRecords('example.com')

            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(result).toEqual(sortedRecords)
        })
    })
})
