/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-type-assertion -- test */

import { Redis } from 'ioredis'
import { ATOMIC_DECR_SCRIPT, ATOMIC_INCR_SCRIPT, REDIS_KEY, RedisConnectionLimiter } from './connection-limiter'
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { PinoLogger } from '../logging'
import pinoFactory from 'pino'
import Mocked = jest.Mocked

jest.useFakeTimers()

jest.mock('pino')
jest.mock('../logging')

describe('RedisConnectionLimiter', () => {
    const { LOCK_FAILURE, LOCK_SUCCESS, NUM_KEYS, ACQUIRE_WAIT_MS } = RedisConnectionLimiter

    const pino = pinoFactory()
    const logger = new PinoLogger(pino) as Mocked<PinoLogger>
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
            redis.eval.mockResolvedValue(LOCK_SUCCESS)

            await expect(connectionLimiter.acquire(source, destination)).resolves.not.toThrow()
            expect(redis.eval).toHaveBeenCalledWith(
                ATOMIC_INCR_SCRIPT,
                NUM_KEYS,
                key,
                destination,
                maxConnections,
                ttlSeconds,
            )
        })

        it('should retry acquiring a connection if maxConnectionsPerSourceHost is reached', async () => {
            const CALLED_TIMES = 2

            redis.eval.mockResolvedValueOnce(LOCK_FAILURE).mockResolvedValueOnce(LOCK_SUCCESS)

            const acquirePromise = connectionLimiter.acquire(source, destination)
            jest.advanceTimersByTime(ACQUIRE_WAIT_MS)
            await acquirePromise

            await expect(acquirePromise).resolves.not.toThrow()
            expect(redis.eval).toHaveBeenCalledTimes(CALLED_TIMES)
        })

        it('should abort pending acquisitions', async () => {
            redis.eval.mockResolvedValueOnce(LOCK_SUCCESS).mockResolvedValueOnce(LOCK_FAILURE)
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
            redis.eval.mockResolvedValue(LOCK_SUCCESS)

            await connectionLimiter.release(source, destination)

            expect(redis.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, NUM_KEYS, key, destination, ttlSeconds)
        })

        it('should not set negative connections', async () => {
            redis.eval.mockResolvedValue(LOCK_FAILURE)

            await connectionLimiter.release(source, destination)

            expect(redis.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, NUM_KEYS, key, destination, ttlSeconds)
        })

        it('should handle missing key gracefully', async () => {
            redis.eval.mockResolvedValue(LOCK_FAILURE)

            await connectionLimiter.release('', '')

            expect(redis.eval).toHaveBeenCalledWith(ATOMIC_DECR_SCRIPT, NUM_KEYS, `${REDIS_KEY}:`, '', ttlSeconds)
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
