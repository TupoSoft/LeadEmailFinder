import type { Redis } from 'ioredis'
import { setTimeout } from 'node:timers'
import { ok } from 'node:assert'
import console from 'node:console'

export const REDIS_KEY = 'SOURCE_DESTIONAION_CONNECTION_LIMIT'

export const ATOMIC_INCR_SCRIPT = `
    local current = redis.call('GET', KEYS[1])
    local limit = tonumber(ARGV[1])
    if not current or tonumber(current) < limit then
        redis.call('INCR', KEYS[1])
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        return 1
    else
        return 0
    end
`

export const ATOMIC_DECR_SCRIPT = `
    local current = redis.call('GET', KEYS[1])
    if current and tonumber(current) > 0 then
        redis.call('DECR', KEYS[1])
        redis.call('EXPIRE', KEYS[1], ARGV[1])
        return 1
    else
        return 0
    end
`

export interface ConnectionLimiter {
    acquire: (source: string, destination: string) => Promise<void>

    release: (source: string, destination: string) => Promise<void>
}

export class RedisConnectionLimiter implements ConnectionLimiter {
    constructor(
        private readonly redisClient: Redis,
        private readonly redisKey = REDIS_KEY,
        private readonly maxConnections = 1,
        private readonly ttlSeconds = 60,
    ) {}

    async acquire(source: string, destination: string): Promise<void> {
        const key = this.getKey(source, destination)

        while (true) {
            try {
                const result = await this.redisClient.eval(
                    ATOMIC_INCR_SCRIPT,
                    1,
                    key,
                    this.maxConnections,
                    this.ttlSeconds,
                ) as number

                if (result === 1) {
                    console.info(`${source}:${destination} incremented`)
                    return
                }

                console.info(`${source} is waiting to connect to ${destination}`)
                await new Promise(resolve => setTimeout(resolve, 100))
            } catch (error) {
                ok(error instanceof Error)
                console.error(`Error acquiring connection for ${source}:${destination}: ${error.message}`)
                throw error
            }
        }
    }

    async release(source: string, destination: string): Promise<void> {
        const key = this.getKey(source, destination)

        try {
            const result = await this.redisClient.eval(ATOMIC_DECR_SCRIPT, 1, key, this.ttlSeconds) as number

            if (result === 1) {
                console.info(`${source}:${destination} decremented`)
            } else {
                console.info(`${source}:${destination} not decremented (key might have expired)`)
            }
        } catch (error) {
            ok(error instanceof Error)
            console.error(`Error releasing connection for ${source}:${destination}: ${error.message}`)
            throw error
        }
    }

    private getKey(source: string, destination: string): string {
        return `${this.redisKey}:${source}-${destination}`
    }
}
