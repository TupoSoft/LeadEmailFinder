import { Inject, Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { SubmissionLimitOutcome, VerificationSubmissionLimiter } from '../../application/ports/verification-submission-limiter'
import { withVerificationRedisTimeout } from './verification-redis-timeout'

const TOKEN_BUCKET_SCRIPT = `
    local now = tonumber(ARGV[1])
    local capacity = tonumber(ARGV[2])
    local refillPerSecond = tonumber(ARGV[3])

    local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens'))
    local updatedAt = tonumber(redis.call('HGET', KEYS[1], 'updatedAtMs'))

    if tokens == nil or updatedAt == nil then
        tokens = capacity
        updatedAt = now
    end

    local elapsedMs = now - updatedAt
    if elapsedMs > 0 then
        tokens = math.min(capacity, tokens + (elapsedMs / 1000) * refillPerSecond)
    end

    local ttlSeconds = math.ceil((capacity / refillPerSecond) * 2)

    if tokens >= 1 then
        tokens = tokens - 1
        redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'updatedAtMs', tostring(now))
        redis.call('EXPIRE', KEYS[1], ttlSeconds)
        return {1, 0}
    end

    redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'updatedAtMs', tostring(now))
    redis.call('EXPIRE', KEYS[1], ttlSeconds)
    local deficit = 1 - tokens
    local retryAfterMs = math.ceil((deficit / refillPerSecond) * 1000)
    return {0, retryAfterMs}
`

@Injectable()
export class RedisVerificationSubmissionLimiter implements VerificationSubmissionLimiter {
    constructor(@Inject(Redis) private readonly redis: Redis) {}

    async tryConsume(
        organizationId: string,
        now: number,
        capacity: number,
        refillPerSecond: number,
    ): Promise<SubmissionLimitOutcome> {
        const key = `verification:ratelimit:${encodeKeyPart(organizationId)}`
        const [allowed, retryAfterMs] = (await withVerificationRedisTimeout(
            'verification-submission-limiter.tryConsume',
            this.redis.eval(TOKEN_BUCKET_SCRIPT, 1, key, String(now), String(capacity), String(refillPerSecond)),
        )) as [number, number]

        return Number(allowed) === 1 ? { allowed: true } : { allowed: false, retryAfterMs: Number(retryAfterMs) }
    }
}

function encodeKeyPart(value: string): string {
    return Buffer.from(value).toString('base64url')
}
