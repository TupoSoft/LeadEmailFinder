import type { Redis, Result } from 'ioredis'
import { setTimeout } from 'node:timers/promises'
import type { Logger } from 'logging'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const randomBytesAsync = promisify(randomBytes)

declare module 'ioredis' {
    interface RedisCommander<Context> {
        // eslint-disable-next-line @typescript-eslint/max-params -- redis lua script
        acquireConnection: (
            key: string,
            token: string,
            now: string,
            ttlMs: string,
            maxConnections: string,
        ) => Result<string | null, Context>
        releaseConnection: (key: string, token: string) => Result<number, Context>
    }
}

export const ATOMIC_INCR_SCRIPT = `
    local key = KEYS[1]
    local token = ARGV[1]
    local now = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])
    local limit = tonumber(ARGV[4])
    -- Remove expired tokens.
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - ttl)
    -- Add the new token with the current timestamp.
    redis.call('ZADD', key, now, token)
    -- Count current tokens.
    local count = redis.call('ZCARD', key)
    if count <= limit then
      redis.call('PEXPIRE', key, ttl)
      return token
    else
      redis.call('ZREM', key, token)
      return nil
    end
`

export const ATOMIC_DECR_SCRIPT = `
    local key = KEYS[1]
    local token = ARGV[1]
    return redis.call('ZREM', key, token)
`

export interface ConnectionLimiter {
    acquire: (source: string, destination: string, signal?: AbortSignal) => Promise<string | null>

    release: (source: string, destination: string, token: string) => Promise<void>
}

export class RedisConnectionLimiter implements ConnectionLimiter {
    public static readonly REDIS_KEY_PREFIX = 'SMTP_CONNECTION_LIMIT'
    public static readonly DEFAULT_MAX_CONNECTIONS = 1
    public static readonly DEFAULT_TTL_MS = 60000
    public static readonly INITIAL_BACKOFF_MS = 100
    public static readonly MAX_BACKOFF_MS = 1000
    public static readonly BACKOFF_MULTIPLIER = 2
    public static readonly TOKEN_LENGTH = 16
    public static readonly NUM_KEYS = 1
    public static readonly RELEASE_SUCCESS = 1

    constructor(
        private readonly redis: Redis,
        private readonly logger: Logger,
        private readonly maxConnections: number = RedisConnectionLimiter.DEFAULT_MAX_CONNECTIONS,
        private readonly ttlMs: number = RedisConnectionLimiter.DEFAULT_TTL_MS,
    ) {
        this.redis.defineCommand('acquireConnection', {
            lua: ATOMIC_INCR_SCRIPT,
            numberOfKeys: RedisConnectionLimiter.NUM_KEYS,
        })

        this.redis.defineCommand('releaseConnection', {
            lua: ATOMIC_DECR_SCRIPT,
            numberOfKeys: RedisConnectionLimiter.NUM_KEYS,
        })
    }

    private static getKey(source: string, destination: string): string {
        return `${RedisConnectionLimiter.REDIS_KEY_PREFIX}:${source}:${destination}`
    }

    private static async generateToken(): Promise<string> {
        const bytes = await randomBytesAsync(RedisConnectionLimiter.TOKEN_LENGTH)
        return bytes.toString('hex')
    }

    async acquire(source: string, destination: string, signal?: AbortSignal): Promise<string | null> {
        const key = RedisConnectionLimiter.getKey(source, destination)
        const token = await RedisConnectionLimiter.generateToken()
        let backoff = RedisConnectionLimiter.INITIAL_BACKOFF_MS as number

        while (true) {
            if (signal?.aborted === true) {
                this.logger.debug(`Acquisition aborted for ${source}:${destination}`)
                return null
            }

            const result = await this.tryAcquire(key, token)
            if (result != null) {
                this.logger.debug(`Acquired connection for ${source}:${destination} with token ${result}`)
                return result
            }

            this.logger.debug(`Connection limit reached for ${source}:${destination}. Retrying in ${backoff}ms`)
            await setTimeout(backoff)
            backoff = Math.min(
                backoff * RedisConnectionLimiter.BACKOFF_MULTIPLIER,
                RedisConnectionLimiter.MAX_BACKOFF_MS,
            )
        }
    }

    async release(source: string, destination: string, token: string): Promise<void> {
        const key = RedisConnectionLimiter.getKey(source, destination)
        try {
            const removed: number = await this.redis.releaseConnection(key, token)
            if (removed === RedisConnectionLimiter.RELEASE_SUCCESS) {
                this.logger.debug(`Released connection for ${source}:${destination} with token ${token}`)
            } else {
                this.logger.debug(
                    `Token ${token} not found for ${source}:${destination}. It may have expired or already been released.`,
                )
            }
        } catch (error: unknown) {
            const message = `Error releasing connection for ${source}:${destination}`
            if (error instanceof Error) {
                this.logger.error(`${message}: ${error.message}`)
                throw error
            }

            throw new Error(message)
        }
    }

    private async tryAcquire(key: string, token: string): Promise<string | null> {
        try {
            const now = Date.now()
            return await this.redis.acquireConnection(
                key,
                token,
                now.toString(),
                this.ttlMs.toString(),
                this.maxConnections.toString(),
            )
        } catch (error: unknown) {
            if (error instanceof Error) {
                this.logger.error(`Error acquiring connection for ${key}: ${error.message}`)
            }
            return null
        }
    }
}
