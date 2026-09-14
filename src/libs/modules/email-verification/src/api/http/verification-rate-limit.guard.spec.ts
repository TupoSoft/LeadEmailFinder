import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    VerificationRateLimitGuard,
    VERIFICATION_SUBMISSION_RATE_CAPACITY,
    VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND,
} from './verification-rate-limit.guard'
import {
    VERIFICATION_SUBMISSION_LIMITER,
    VerificationSubmissionLimiter,
    VerificationSubmissionLimiterUnavailableError,
} from '../../application/ports/verification-submission-limiter'

describe('VerificationRateLimitGuard', () => {
    let guard: VerificationRateLimitGuard
    let limiter: jest.Mocked<VerificationSubmissionLimiter>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VerificationRateLimitGuard,
                { provide: VERIFICATION_SUBMISSION_LIMITER, useValue: { tryConsume: jest.fn() } },
                { provide: VERIFICATION_SUBMISSION_RATE_CAPACITY, useValue: 60 },
                { provide: VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND, useValue: 1 },
            ],
        }).compile()

        guard = module.get(VerificationRateLimitGuard)
        limiter = module.get(VERIFICATION_SUBMISSION_LIMITER)
    })

    const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal
    const setHeader = jest.fn()

    const contextWithRequest = (request: { authPrincipal?: AuthPrincipal }): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => ({ setHeader }),
            }),
        }) as unknown as ExecutionContext

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('throws 401 if no authentication principal is on the request', async () => {
        await expect(guard.canActivate(contextWithRequest({}))).rejects.toMatchObject({
            status: HttpStatus.UNAUTHORIZED,
        })
    })

    it('allows the request when a token is available', async () => {
        limiter.tryConsume.mockResolvedValue({ allowed: true })

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).resolves.toBe(true)
        expect(limiter.tryConsume).toHaveBeenCalledWith('org-1', expect.any(Number), 60, 1)
    })

    it('throws 429 with a Retry-After header when the bucket is empty', async () => {
        limiter.tryConsume.mockResolvedValue({ allowed: false, retryAfterMs: 2500 })

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).rejects.toMatchObject({
            status: HttpStatus.TOO_MANY_REQUESTS,
        })
        expect(setHeader).toHaveBeenCalledWith('Retry-After', '3')
    })

    it('throws 503 when Redis is unavailable', async () => {
        limiter.tryConsume.mockRejectedValue(new VerificationSubmissionLimiterUnavailableError('tryConsume'))

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).rejects.toMatchObject({
            status: HttpStatus.SERVICE_UNAVAILABLE,
        })
    })

    it('rethrows unexpected errors', async () => {
        const error = new Error('boom')
        limiter.tryConsume.mockRejectedValue(error)

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).rejects.toThrow(error)
    })

    it('is an instance of HttpException on rejection', async () => {
        limiter.tryConsume.mockResolvedValue({ allowed: false, retryAfterMs: 1000 })

        await expect(guard.canActivate(contextWithRequest({ authPrincipal: principal }))).rejects.toBeInstanceOf(
            HttpException,
        )
    })
})
