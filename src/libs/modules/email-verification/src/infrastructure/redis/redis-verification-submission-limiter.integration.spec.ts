import { randomUUID } from 'node:crypto'
import Redis from 'ioredis'
import { RedisVerificationSubmissionLimiter } from './redis-verification-submission-limiter'

const redisUrl = process.env['TEST_REDIS_URL']
const describeWithRedis = redisUrl === undefined ? describe.skip : describe

describeWithRedis('RedisVerificationSubmissionLimiter against real Redis', () => {
    let connection: Redis
    let limiter: RedisVerificationSubmissionLimiter

    beforeEach(() => {
        connection = new Redis(redisUrl!, { maxRetriesPerRequest: null })
        limiter = new RedisVerificationSubmissionLimiter(connection)
    })

    afterEach(async () => {
        await connection?.quit()
    })

    it('admits up to capacity, rejects the next attempt with a retry delay, then refills over real time', async () => {
        const organizationId = randomUUID()
        const now = Date.now()

        await expect(limiter.tryConsume(organizationId, now, 2, 10)).resolves.toEqual({ allowed: true })
        await expect(limiter.tryConsume(organizationId, now, 2, 10)).resolves.toEqual({ allowed: true })

        const rejected = await limiter.tryConsume(organizationId, now, 2, 10)
        expect(rejected.allowed).toBe(false)
        if (rejected.allowed) throw new Error('unreachable')
        expect(rejected.retryAfterMs).toBeGreaterThan(0)
        expect(rejected.retryAfterMs).toBeLessThanOrEqual(100)

        await new Promise(resolve => setTimeout(resolve, rejected.retryAfterMs))
        await expect(limiter.tryConsume(organizationId, Date.now(), 2, 10)).resolves.toEqual({ allowed: true })
    })

    it('keeps separate organizations independent', async () => {
        const now = Date.now()
        const first = randomUUID()
        const second = randomUUID()

        await expect(limiter.tryConsume(first, now, 1, 1)).resolves.toEqual({ allowed: true })
        await expect(limiter.tryConsume(first, now, 1, 1)).resolves.toMatchObject({ allowed: false })
        await expect(limiter.tryConsume(second, now, 1, 1)).resolves.toEqual({ allowed: true })
    })
})
