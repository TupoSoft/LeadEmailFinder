const resolveMxMock = jest.fn<typeof resolveMx>()
const reverseMock = jest.fn<typeof reverse>()

import { DnsService } from './dns.service'
import { Redis } from 'ioredis'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { DNSTypeMap } from './util'
import { Test } from '@nestjs/testing'
import { resolveMx, reverse } from 'node:dns/promises'

jest.mock('node:dns/promises', () => ({
    resolveMx: resolveMxMock,
    reverse: reverseMock,
}))

const mockedRedis = {
    get: jest.fn<typeof Redis.prototype.get>(),
    set: jest.fn<typeof Redis.prototype.set>(),
}

describe('DnsService', () => {
    let dnsService: DnsService

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                {
                    provide: Redis,
                    useValue: mockedRedis,
                },
                DnsService,
            ],
        }).compile()

        dnsService = moduleRef.get(DnsService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('resolve', () => {
        it('should return cached records if present', async () => {
            const cachedMXRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            mockedRedis.get.mockResolvedValueOnce(JSON.stringify(cachedMXRecords))

            const result = await dnsService.resolve('example.com', 'MX')

            expect(mockedRedis.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedMXRecords)
        })

        it('should fetch and cache records if not present in cache', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMxMock.mockResolvedValueOnce(mxRecords)

            mockedRedis.get.mockResolvedValueOnce(null) // No cache
            mockedRedis.set.mockResolvedValueOnce('OK')

            const result = await dnsService.resolve('example.com', 'MX')

            expect(mockedRedis.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(resolveMxMock).toHaveBeenCalledWith('example.com')
            expect(mockedRedis.set).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(mxRecords),
                'EX',
                DnsService.DEFAULT_TTL_SECONDS,
            )
            expect(result).toEqual(mxRecords)
        })

        it('should use reverse lookup for PTR records', async () => {
            const ptrRecords: DNSTypeMap['PTR'] = ['example.com']
            reverseMock.mockResolvedValueOnce(ptrRecords)

            mockedRedis.get.mockResolvedValueOnce(null) // No cache
            mockedRedis.set.mockResolvedValueOnce('OK')

            const result = await dnsService.resolve('192.0.2.1', 'PTR')

            expect(mockedRedis.get).toHaveBeenCalledWith('DNS_CACHE:PTR:192.0.2.1')
            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
            expect(mockedRedis.set).toHaveBeenCalledWith(
                'DNS_CACHE:PTR:192.0.2.1',
                JSON.stringify(ptrRecords),
                'EX',
                DnsService.DEFAULT_TTL_SECONDS,
            )
            expect(result).toEqual(ptrRecords)
        })
    })

    describe('getCachedRecords', () => {
        it('should return parsed cached data if present', async () => {
            const cachedData = [{ exchange: 'mail.example.com', priority: 10 }]
            mockedRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData))

            // @ts-expect-error testing private method
            const result = await dnsService.getCachedRecords('example.com', 'MX')

            expect(mockedRedis.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toEqual(cachedData)
        })

        it('should return null if no cached data is present', async () => {
            mockedRedis.get.mockResolvedValueOnce(null)

            // @ts-expect-error testing private method
            const result = await dnsService.getCachedRecords('example.com', 'MX')

            expect(mockedRedis.get).toHaveBeenCalledWith('DNS_CACHE:MX:example.com')
            expect(result).toBeNull()
        })
    })

    describe('cacheRecords', () => {
        it('should cache records with TTL', async () => {
            const records = [{ exchange: 'mail.example.com', priority: 10 }]
            mockedRedis.set.mockResolvedValueOnce('OK')

            // @ts-expect-error testing private method
            await dnsService.cacheRecords('example.com', 'MX', records)

            expect(mockedRedis.set).toHaveBeenCalledWith(
                'DNS_CACHE:MX:example.com',
                JSON.stringify(records),
                'EX',
                DnsService.DEFAULT_TTL_SECONDS,
            )
        })
    })
})
