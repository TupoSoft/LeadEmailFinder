/* eslint-disable @typescript-eslint/unbound-method */

import { describe, expect, it, jest } from '@jest/globals'
import { Redis } from 'ioredis'
import { RedisCatchAllCache } from './catch-all-cache'

jest.mock('ioredis', () => ({
    Redis: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
    })),
}))

describe('CatchAllCache', () => {
    const redisMock = new Redis() as jest.Mocked<Redis>
    const catchAllCache = new RedisCatchAllCache(redisMock)

    const domain = 'example.com'
    const status = true

    describe('getCatchAllStatusForDomain', () => {
        it('should return true if catch all status is in the cache', async () => {
            redisMock.get.mockResolvedValueOnce('true')
            const result = await catchAllCache.getCatchAllStatusForDomain(domain)
            expect(result).toEqual(true)
            expect(redisMock.get).toHaveBeenCalledWith(`CATCH_ALL_STATUS:${domain}`)
        })

        it('should return false if catch all status is false in the cache', async () => {
            redisMock.get.mockResolvedValueOnce('false')
            const result = await catchAllCache.getCatchAllStatusForDomain(domain)
            expect(result).toEqual(false)
            expect(redisMock.get).toHaveBeenCalledWith(`CATCH_ALL_STATUS:${domain}`)
        })

        it('should return undefined if cache all status is not in the cache', async () => {
            redisMock.get.mockResolvedValueOnce(null)
            const result = await catchAllCache.getCatchAllStatusForDomain(domain)
            expect(result).toEqual(undefined)
        })
    })

    describe('setCatchAllStatusForDomain', () => {
        it('should successfully cache catch all status for domain', async () => {
            redisMock.set.mockResolvedValueOnce('OK')
            await expect(catchAllCache.setCatchAllStatusForDomain(domain, status)).resolves.not.toThrow()
        })

        it('should throw an error if failed to cache', async () => {
            redisMock.set.mockResolvedValueOnce(null)
            await expect(catchAllCache.setCatchAllStatusForDomain(domain, status)).rejects.toThrow(
                `Failed to cache catch all status '${status}' for domain '${domain}'`,
            )
        })

        it('should rethrow an error if redis throws', async () => {
            const redisError = new Error('Redis error')
            redisMock.set.mockRejectedValueOnce(redisError)
            await expect(catchAllCache.setCatchAllStatusForDomain(domain, status)).rejects.toThrow(redisError)
        })
    })
})
