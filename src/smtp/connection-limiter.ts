import type { Redis } from 'ioredis'
import { setTimeout } from 'node:timers'
import { ok } from 'node:assert'
import type { Logger } from '../logging'

export const REDIS_KEY = 'SOURCE_DESTIONAION_CONNECTION_LIMIT'

export const ATOMIC_INCR_SCRIPT = `
    local proxy = KEYS[1]
    local exchange = ARGV[1]
    local limit = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])
    local result = redis.call('HMGET', proxy, exchange)
    local count = result[1]
    
    if not count or tonumber(count) < limit then
        redis.call('HINCRBY', proxy, exchange, 1)
        redis.call('EXPIRE', proxy, ttl)
        return 1
    else
        return 0
    end
`

export const ATOMIC_DECR_SCRIPT = `
    local proxy, exchange, ttl = KEYS[1], ARGV[1], tonumber(ARGV[2])
    local result = redis.call('HMGET', proxy, exchange)
    local count = result[1]
    
    if count and tonumber(count) > 0 then
        redis.call('HINCRBY', proxy, exchange, -1)
        redis.call('EXPIRE', proxy, ttl)
        return 1
    else
        return 0
    end
`

export interface ConnectionLimiter {
    acquire: (source: string, destination: string, signal?: AbortSignal) => Promise<boolean>

    release: (source: string, destination: string) => Promise<void>
}

export class RedisConnectionLimiter implements ConnectionLimiter {
    public static readonly LOCK_SUCCESS = 1
    public static readonly LOCK_FAILURE = 0
    public static readonly DEFAULT_MAX_CONNECTIONS = 1
    public static readonly ACQUIRE_WAIT_MS = 100
    public static readonly DEFAULT_TTL_SECONDS = 300
    public static readonly NUM_KEYS = 1

    constructor(
        private readonly redisClient: Redis,
        private readonly logger: Logger,
        private readonly redisKey = REDIS_KEY,
        private readonly maxConnections = RedisConnectionLimiter.DEFAULT_MAX_CONNECTIONS,
        private readonly ttlSeconds = RedisConnectionLimiter.DEFAULT_TTL_SECONDS,
    ) {}

    async acquire(source: string, destination: string, signal?: AbortSignal): Promise<boolean> {
        const key = this.getKey(source)

        while (true) {
            try {
                if (signal?.aborted === true) return false

                const result = await this.redisClient.eval(
                    ATOMIC_INCR_SCRIPT,
                    RedisConnectionLimiter.NUM_KEYS,
                    key,
                    destination,
                    this.maxConnections,
                    this.ttlSeconds,
                )

                if (result === RedisConnectionLimiter.LOCK_SUCCESS) {
                    this.logger.info(`${source}:${destination} incremented`)
                    return true
                }

                await new Promise(resolve => setTimeout(resolve, RedisConnectionLimiter.ACQUIRE_WAIT_MS))
            } catch (error) {
                ok(error instanceof Error)
                this.logger.error(`Error acquiring connection for ${source}:${destination}: ${error.message}`)

                return false
            }
        }
    }

    async release(source: string, destination: string): Promise<void> {
        const key = this.getKey(source)

        try {
            const result = await this.redisClient.eval(
                ATOMIC_DECR_SCRIPT,
                RedisConnectionLimiter.NUM_KEYS,
                key,
                destination,
                this.ttlSeconds,
            )

            if (result === RedisConnectionLimiter.LOCK_SUCCESS) {
                this.logger.info(`${source}:${destination} decremented`)
            } else {
                this.logger.info(`${source}:${destination} not decremented (key might have expired)`)
                this.logger.info(`${source}:${destination} not decremented (key might have expired)`)
            }
        } catch (error) {
            ok(error instanceof Error)
            this.logger.error(`Error releasing connection for ${source}:${destination}: ${error.message}`)
            throw error
        }
    }

    private getKey(source: string): string {
        return `${this.redisKey}:${source}`
    }
}
