import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { Request, Response } from 'express'
import { getAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import {
    VERIFICATION_SUBMISSION_LIMITER,
    VerificationSubmissionLimiter,
    VerificationSubmissionLimiterUnavailableError,
} from '../../application/ports/verification-submission-limiter'

export const VERIFICATION_SUBMISSION_RATE_CAPACITY = Symbol('VERIFICATION_SUBMISSION_RATE_CAPACITY')
export const VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND = Symbol('VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND')

@Injectable()
export class VerificationRateLimitGuard implements CanActivate {
    constructor(
        @Inject(VERIFICATION_SUBMISSION_LIMITER) private readonly limiter: VerificationSubmissionLimiter,
        @Inject(VERIFICATION_SUBMISSION_RATE_CAPACITY) private readonly capacity: number,
        @Inject(VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND) private readonly refillPerSecond: number,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()
        const principal = getAuthPrincipal(request)

        if (!principal) {
            throw new HttpException('Authentication principal is missing', HttpStatus.UNAUTHORIZED)
        }

        let outcome
        try {
            outcome = await this.limiter.tryConsume(principal.organizationId, Date.now(), this.capacity, this.refillPerSecond)
        } catch (error) {
            if (error instanceof VerificationSubmissionLimiterUnavailableError) {
                throw new HttpException('rate_limit_unavailable', HttpStatus.SERVICE_UNAVAILABLE)
            }
            throw error
        }

        if (!outcome.allowed) {
            const response = context.switchToHttp().getResponse<Response>()
            response.setHeader('Retry-After', String(Math.ceil(outcome.retryAfterMs / 1000)))
            throw new HttpException('rate_limited', HttpStatus.TOO_MANY_REQUESTS)
        }

        return true
    }
}
