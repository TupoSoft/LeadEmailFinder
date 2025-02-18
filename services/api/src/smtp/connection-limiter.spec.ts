/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- test */

import { Redis } from 'ioredis'
import { REDIS_KEY, RedisConnectionLimiter } from './connection-limiter'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { PinoLogger } from 'logging'
import Mocked = jest.Mocked

jest.useFakeTimers()

jest.mock('pino')
jest.mock('logging')

describe('RedisConnectionLimiter', () => {
    const { LOCK_FAILURE, LOCK_SUCCESS, INITIAL_BACKOFF_MS } = RedisConnectionLimiter

    const logger = new PinoLogger() as Mocked<PinoLogger>
    const redis = new Redis() as jest.Mocked<Redis>
    const maxConnections = 3
    const ttlSeconds = 60

    const connectionLimiter = new RedisConnectionLimiter(redis, logger, REDIS_KEY, maxConnections, ttlSeconds)

    afterEach(() => {
        jest.clearAllMocks()
    })

    const source = '192.168.0.1'
    const destination = 'example.com'
    const key = `${REDIS_KEY}:${source}`

    describe('acquire', () => {
        it('should acquire a connection if below maxConnectionsPerSourceHost', async () => {
            redis.incrementConnection.mockResolvedValue(LOCK_SUCCESS)

            await expect(connectionLimiter.acquire(source, destination)).resolves.not.toThrow()
            expect(redis.incrementConnection).toHaveBeenCalledWith(key, destination, maxConnections, ttlSeconds)
        })

        it('should retry acquiring a connection if maxConnectionsPerSourceHost is reached', async () => {
            const CALLED_TIMES = 2

            redis.incrementConnection.mockResolvedValueOnce(LOCK_FAILURE).mockResolvedValueOnce(LOCK_SUCCESS)

            const acquirePromise = connectionLimiter.acquire(source, destination)
            jest.advanceTimersByTime(INITIAL_BACKOFF_MS)
            await acquirePromise

            await expect(acquirePromise).resolves.not.toThrow()
            expect(redis.incrementConnection).toHaveBeenCalledTimes(CALLED_TIMES)
        })

        it('should abort pending acquisitions', async () => {
            redis.incrementConnection.mockResolvedValueOnce(LOCK_SUCCESS).mockResolvedValueOnce(LOCK_FAILURE)
            const abortController = new AbortController()

            const acquisitions = [
                connectionLimiter.acquire(source, destination, abortController.signal),
                connectionLimiter.acquire(source, destination, abortController.signal),
            ]

            const firstAcquisitionPromise = Promise.any(acquisitions)
            const allAcquisitionPromises = Promise.all(acquisitions)

            await expect(firstAcquisitionPromise).resolves.toBe(true)

            abortController.abort('Acquisition')

            await expect(allAcquisitionPromises).resolves.toStrictEqual([true, false])
        })
    })

    describe('release', () => {
        it('should release a connection if there are active connections', async () => {
            redis.decrementConnection.mockResolvedValue(LOCK_SUCCESS)

            await connectionLimiter.release(source, destination)

            expect(redis.decrementConnection).toHaveBeenCalledWith(key, destination, ttlSeconds)
        })

        it('should not set negative connections', async () => {
            redis.decrementConnection.mockResolvedValue(LOCK_FAILURE)

            await connectionLimiter.release(source, destination)

            expect(redis.decrementConnection).toHaveBeenCalledWith(key, destination, ttlSeconds)
        })

        it('should handle missing key gracefully', async () => {
            redis.decrementConnection.mockResolvedValue(LOCK_FAILURE)

            await connectionLimiter.release('', '')

            expect(redis.decrementConnection).toHaveBeenCalledWith(`${REDIS_KEY}:`, '', ttlSeconds)
        })
    })

    describe('getKey', () => {
        it('should generate the correct key', () => {
            // @ts-expect-error testing
            const key = connectionLimiter.getKey(source, destination)
            expect(key).toBe(`${REDIS_KEY}:${source}`)
        })
    })
})
