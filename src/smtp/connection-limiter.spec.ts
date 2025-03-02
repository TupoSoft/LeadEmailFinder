import { RedisConnectionLimiter } from './connection-limiter'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { Redis } from 'ioredis'
import type { Logger } from '../logging'
import Mocked = jest.Mocked

jest.mock('ioredis')

describe('RedisConnectionLimiter', () => {
    const redis = new Redis() as Mocked<Redis>
    const logger: Logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
    const limiter = new RedisConnectionLimiter(redis, logger)

    afterEach(() => {
        jest.clearAllMocks()
        jest.useRealTimers()
    })

    describe('acquire', () => {
        it('should return a token immediately if redis.acquireConnection returns a token', async () => {
            redis.acquireConnection.mockResolvedValue('fixedtoken')
            const token = await limiter.acquire('source', 'destination')

            expect(token).toBe('fixedtoken')
            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Acquired connection for source:destination with token fixedtoken'),
            )
            expect(redis.acquireConnection).toHaveBeenCalledTimes(1)
        })

        it('should retry if redis.acquireConnection returns null and eventually succeed', async () => {
            jest.useFakeTimers()
            redis.acquireConnection.mockResolvedValueOnce(null).mockResolvedValueOnce('fixedtoken')

            const acquirePromise = limiter.acquire('src', 'dest')

            await jest.advanceTimersByTimeAsync(RedisConnectionLimiter.INITIAL_BACKOFF_MS)

            const token = await acquirePromise

            expect(token).toBe('fixedtoken')
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Connection limit reached for src:dest'))
            expect(redis.acquireConnection).toHaveBeenCalledTimes(2)
        })

        it('should abort immediately if the abort signal is already aborted', async () => {
            const abortController = new AbortController()
            abortController.abort()

            const token = await limiter.acquire('src', 'dest', abortController.signal)

            expect(token).toBeNull()
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Acquisition aborted for src:dest'))
        })
    })

    describe('release', () => {
        it('should log success if the token is released (redis.releaseConnection returns 1)', async () => {
            redis.releaseConnection.mockResolvedValue(1)

            await limiter.release('src', 'dest', 'fixedtoken')

            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Released connection for src:dest with token fixedtoken'),
            )
            expect(redis.releaseConnection).toHaveBeenCalledTimes(1)
        })

        it('should log a token not found message if redis.releaseConnection returns 0', async () => {
            redis.releaseConnection.mockResolvedValue(0)

            await limiter.release('src', 'dest', 'fixedtoken')

            expect(logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Token fixedtoken not found for src:dest'),
            )
        })

        it('should throw an error if redis.releaseConnection throws an error', async () => {
            const error = new Error('Release error')
            redis.releaseConnection.mockRejectedValue(error)

            await expect(limiter.release('src', 'dest', 'fixedtoken')).rejects.toThrow('Release error')
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error releasing connection for src:dest: Release error'),
            )
        })
    })
})
