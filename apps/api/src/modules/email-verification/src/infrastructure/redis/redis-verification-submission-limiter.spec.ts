import { Test } from '@nestjs/testing'
import { Redis } from 'ioredis'
import { VerificationSubmissionLimiterUnavailableError } from '../../application/ports/verification-submission-limiter'
import { RedisVerificationSubmissionLimiter } from './redis-verification-submission-limiter'

describe('RedisVerificationSubmissionLimiter', () => {
    let limiter: RedisVerificationSubmissionLimiter
    let redis: { eval: jest.Mock }

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [RedisVerificationSubmissionLimiter, { provide: Redis, useValue: { eval: jest.fn() } }],
        }).compile()

        limiter = moduleRef.get(RedisVerificationSubmissionLimiter)
        redis = moduleRef.get(Redis)
    })

    it('allows consumption when the script reports a token was available', async () => {
        redis.eval.mockResolvedValue([1, 0])

        await expect(limiter.tryConsume('org-1', 1_700_000_000_000, 60, 1)).resolves.toEqual({ allowed: true })
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining('HGET'),
            1,
            expect.stringContaining('verification:ratelimit:'),
            '1700000000000',
            '60',
            '1',
        )
    })

    it('reports the retry delay when the bucket is empty', async () => {
        redis.eval.mockResolvedValue([0, 5000])

        await expect(limiter.tryConsume('org-1', Date.now(), 60, 1)).resolves.toEqual({
            allowed: false,
            retryAfterMs: 5000,
        })
    })

    it('propagates a Redis timeout as VerificationSubmissionLimiterUnavailableError', async () => {
        jest.useFakeTimers()
        try {
            redis.eval.mockReturnValue(new Promise(() => {}))

            const outcome = limiter.tryConsume('org-1', Date.now(), 60, 1)
            const assertion = expect(outcome).rejects.toBeInstanceOf(VerificationSubmissionLimiterUnavailableError)
            await jest.advanceTimersByTimeAsync(2000)
            await assertion
        } finally {
            jest.useRealTimers()
        }
    })
})
