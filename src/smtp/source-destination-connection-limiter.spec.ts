/* eslint-disable @typescript-eslint/unbound-method */

import { Redis } from 'ioredis' // Replace with your Redis client if different
import {
    ATOMIC_INCR_SCRIPT,
    RedisSourceDestinationConnectionLimiter,
    REDIS_KEY, ATOMIC_DECR_SCRIPT
} from './source-destination-connection-limiter'
import { afterEach, describe, expect, it, jest } from '@jest/globals'

jest.useFakeTimers()

jest.mock('node:console', () => ({
    info: jest.fn(),
}))

jest.mock('ioredis', () => ({
    Redis: jest.fn().mockImplementation(() => ({
        eval: jest.fn<typeof Redis.prototype.eval>()
    })),
}))

describe('RedisSourceHostConnectionManager', () => {
    const redisClient = new Redis() as jest.Mocked<Redis>
    const maxConnections = 3
    const ttlSeconds = 60
    const connectionLimiter = new RedisSourceDestinationConnectionLimiter(redisClient, REDIS_KEY, maxConnections, ttlSeconds)

    afterEach(() => {
        jest.clearAllMocks()
    })

    const source = '192.168.0.1'
    const destination = 'example.com'
    const key = `${REDIS_KEY}:${source}-${destination}`

    describe('acquire', () => {
        it('should acquire a connection if below maxConnectionsPerSourceHost', async () => {
            redisClient.eval.mockResolvedValue(1)

            await expect(connectionLimiter.acquire(source, destination)).resolves.not.toThrow()
            expect(redisClient.eval).toHaveBeenCalledWith(ATOMIC_INCR_SCRIPT, 1, key, maxConnections, ttlSeconds)
        })

        it('should retry acquiring a connection if maxConnectionsPerSourceHost is reached', async () => {
            redisClient.eval
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(1)

            const acquirePromise = connectionLimiter.acquire(source, destination)
            jest.advanceTimersByTime(100)
            await acquirePromise

            await expect(acquirePromise).resolves.not.toThrow()
            expect(redisClient.eval).toHaveBeenCalledTimes(2)
        })
    })

    describe('release', () => {
        it('should release a connection if there are active connections', async () => {
            redisClient.eval.mockResolvedValue(1)

            await connectionLimiter.release(source, destination)

            expect(redisClient.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, 1, key, ttlSeconds)
        })

        it('should not set negative connections', async () => {
            redisClient.eval.mockResolvedValue(0)

            await connectionLimiter.release(source, destination)

            expect(redisClient.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, 1, key, ttlSeconds)
        })

        it('should handle missing key gracefully', async () => {
            redisClient.eval.mockResolvedValue(0)

            await connectionLimiter.release('', '')

            expect(redisClient.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, 1, `${REDIS_KEY}:-`, ttlSeconds)
        })
    })

    describe('getKey', () => {
        it('should generate the correct key', () => {
            // @ts-expect-error testing
            const key = connectionLimiter.getKey(source, destination)
            expect(key).toBe(`${REDIS_KEY}:${source}-${destination}`)
        })
    })
})
