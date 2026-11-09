import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
    VerifyAsyncOutcome,
} from '../../../application/delivery/async/async-email-verification.service'
import { AsyncEmailVerificationJobNotFoundException } from '../../../application/delivery/async/job-not-found.exception'
import {
    VERIFICATION_SUBMISSION_LIMITER,
    VerificationSubmissionLimiter,
    VerificationSubmissionLimiterUnavailableError,
} from '../../../application/ports/verification-submission-limiter'
import {
    VerificationRateLimitGuard,
    VERIFICATION_SUBMISSION_RATE_CAPACITY,
    VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND,
} from '../verification-rate-limit.guard'
import { AsyncEmailVerificationController } from './async-email-verification.controller'

const organizationId = '00000000-0000-4000-8000-000000000001'
const operationId = '00000000-0000-4000-8000-000000000003'
const email = 'test@example.com'
const service: jest.Mocked<Pick<AsyncEmailVerificationService, 'verifyAsync' | 'getAsyncVerificationState'>> = {
    verifyAsync: jest.fn(),
    getAsyncVerificationState: jest.fn(),
}
const limiter: jest.Mocked<VerificationSubmissionLimiter> = { tryConsume: jest.fn() }
const runPrincipal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer.example.test',
    subject: 'client-1',
    organizationId,
    membershipRole: 'member',
    permissions: ['verification:run', 'verification:read'],
    credentialId: 'credential-1',
}

function buildUuidV7(timestampMs: number): string {
    const timestampHex = timestampMs.toString(16).padStart(12, '0')
    return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7000-8000-000000000000`
}

describe('asynchronous verification HTTP contracts', () => {
    let app: INestApplication
    let principal: AuthPrincipal | undefined

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [AsyncEmailVerificationController],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                VerificationRateLimitGuard,
                { provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN, useValue: service },
                { provide: VERIFICATION_SUBMISSION_LIMITER, useValue: limiter },
                { provide: VERIFICATION_SUBMISSION_RATE_CAPACITY, useValue: 60 },
                { provide: VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND, useValue: 1 },
            ],
        }).compile()

        app = moduleRef.createNestApplication({ logger: false })
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            if (principal) setAuthPrincipal(incoming, principal)
            next()
        })
        app.useGlobalPipes(new ValidationPipe())
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()
    })

    beforeEach(() => {
        jest.clearAllMocks()
        principal = runPrincipal
        limiter.tryConsume.mockResolvedValue({ allowed: true })
        service.verifyAsync.mockResolvedValue({ kind: 'accepted', id: operationId })
        service.getAsyncVerificationState.mockResolvedValue({ state: 'queued' })
    })

    afterAll(async () => {
        await app.close()
    })

    function verify(input: Record<string, unknown> = { email }): request.Test {
        return request(app.getHttpServer()).post('/verifyAsync').send(input)
    }

    describe('POST /verifyAsync', () => {
        it('requires authentication before rate limiting or admission', async () => {
            principal = undefined

            const response = await verify().expect(401)

            expect(response.body).toMatchObject({ message: 'Authentication principal is missing' })
            expect(limiter.tryConsume).not.toHaveBeenCalled()
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('requires verification:run before rate limiting or admission', async () => {
            principal = { ...runPrincipal, permissions: ['verification:read'] }

            const response = await verify().expect(403)

            expect(response.body).toMatchObject({ message: 'Missing required permission' })
            expect(limiter.tryConsume).not.toHaveBeenCalled()
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it.each([
            ['missing email', {}],
            ['malformed email', { email: 'not-an-email' }],
            ['localhost', { email: 'test@localhost' }],
            ['blocked company domain', { email: 'test@tuposoft.com' }],
            ['blocked product domain', { email: 'test@leademailfinder.com' }],
        ])('preserves validation for %s after counting the submission', async (_description, input) => {
            const response = await verify(input as Record<string, unknown>).expect(400)

            expect(response.body).toMatchObject({ message: ['email must be an email'] })
            expect(limiter.tryConsume).toHaveBeenCalledTimes(1)
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('rejects an over-limit organization with 429 and an integer Retry-After before admission', async () => {
            limiter.tryConsume.mockResolvedValue({ allowed: false, retryAfterMs: 2_500 })

            const response = await verify().expect(429)

            expect(response.body).toMatchObject({ message: 'rate_limited' })
            expect(response.headers['retry-after']).toBe('3')
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('fails safe with 503 when the limiter cannot respond in time', async () => {
            limiter.tryConsume.mockRejectedValue(new VerificationSubmissionLimiterUnavailableError('tryConsume'))

            const response = await verify().expect(503)

            expect(response.body).toMatchObject({ message: 'rate_limit_unavailable' })
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('rejects a malformed Idempotency-Key with 400 before calling the service', async () => {
            const response = await verify().set('Idempotency-Key', 'not-a-uuid').expect(400)

            expect(response.body).toMatchObject({ message: 'invalid_idempotency_key' })
            expect(service.verifyAsync).not.toHaveBeenCalled()
        })

        it('forwards an old Idempotency-Key to the service instead of rejecting it before a stored-request lookup', async () => {
            // An old key might still match an existing stored request within its seven-day replay window — only
            // admission's own lookup can tell. Only the service's own `conflict/key-expired` outcome (see below)
            // may produce 410 for a key admission determines has genuinely expired with no match.
            const expiredKey = buildUuidV7(Date.now() - 25 * 60 * 60 * 1000)

            await verify().set('Idempotency-Key', expiredKey).expect(202)

            expect(service.verifyAsync).toHaveBeenCalledWith(expect.objectContaining({ clientRequestKey: expiredKey }))
        })

        it('admits with the caller organization and forwards a valid Idempotency-Key', async () => {
            principal = { ...runPrincipal, organizationId: 'other-organization' }
            const key = buildUuidV7(Date.now())

            const response = await verify({ email: 'TEST@EXAMPLE.COM', organizationId: 'untrusted-organization' })
                .set('Idempotency-Key', key)
                .expect(202)

            expect(response.body).toEqual({ id: operationId })
            expect(service.verifyAsync).toHaveBeenCalledWith({
                email: 'TEST@EXAMPLE.COM',
                organizationId: 'other-organization',
                clientRequestKey: key,
            })
        })

        it('maps insufficient-funds to 402', async () => {
            service.verifyAsync.mockResolvedValue({ kind: 'insufficient-funds', id: operationId })

            const response = await verify().expect(402)

            expect(response.body).toMatchObject({ message: 'insufficient_credits' })
        })

        it('maps a key-mismatch conflict to 409', async () => {
            service.verifyAsync.mockResolvedValue({ kind: 'conflict', reason: 'key-mismatch' })

            const response = await verify().expect(409)

            expect(response.body).toMatchObject({ message: 'idempotency_key_conflict' })
        })

        it('maps a key-expired conflict to 410', async () => {
            service.verifyAsync.mockResolvedValue({ kind: 'conflict', reason: 'key-expired' })

            const response = await verify().expect(410)

            expect(response.body).toMatchObject({ message: 'idempotency_key_expired' })
        })

        it('maps address-cooldown to 429 with an integer Retry-After', async () => {
            service.verifyAsync.mockResolvedValue({ kind: 'address-cooldown', retryAfterMs: 30_500 } satisfies VerifyAsyncOutcome)

            const response = await verify().expect(429)

            expect(response.body).toMatchObject({ message: 'verification_cooldown' })
            expect(response.headers['retry-after']).toBe('31')
        })

        it('preserves an unexpected service failure as a generic 500', async () => {
            service.verifyAsync.mockRejectedValue(new Error('private diagnostics'))

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
        })
    })

    describe('GET /verifyAsync/:id', () => {
        it('requires authentication before reading state', async () => {
            principal = undefined

            await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(401)

            expect(service.getAsyncVerificationState).not.toHaveBeenCalled()
        })

        it('requires verification:read before reading state', async () => {
            principal = { ...runPrincipal, permissions: ['verification:run'] }

            await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(403)

            expect(service.getAsyncVerificationState).not.toHaveBeenCalled()
        })

        it('requires a UUID before reading state', async () => {
            const response = await request(app.getHttpServer()).get('/verifyAsync/not-a-uuid').expect(400)

            expect(response.body).toMatchObject({ message: ['id must be a UUID'] })
            expect(service.getAsyncVerificationState).not.toHaveBeenCalled()
        })

        it('reads with the route ID and caller organization', async () => {
            await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(200)

            expect(service.getAsyncVerificationState).toHaveBeenCalledWith(operationId, organizationId)
        })

        it('conceals a missing or foreign operation as 404', async () => {
            service.getAsyncVerificationState.mockRejectedValue(
                new AsyncEmailVerificationJobNotFoundException(operationId),
            )

            const response = await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(404)

            expect(response.body).toEqual({
                statusCode: 404,
                message: `Job with id "${operationId}" not found.`,
                error: 'Not Found',
            })
        })

        it('strips internal result fields and keeps operation metadata on a completed read', async () => {
            service.getAsyncVerificationState.mockResolvedValue({
                state: 'completed',
                result: {
                    id: '00000000-0000-4000-8000-000000000005',
                    email,
                    reason: 'accepted_email',
                    localPart: 'test',
                    domain: 'example.com',
                    exists: true,
                    catchAll: null,
                    sources: ['mx'],
                    organizationId,
                    credentialId: 'private-credential',
                    internalDiagnostic: 'private queue diagnostics',
                },
                operation: {
                    id: operationId,
                    source: 'fresh',
                    observedAt: new Date('2026-09-13T00:00:00.000Z'),
                    cacheExpiresAt: new Date('2026-09-14T00:00:00.000Z'),
                    billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
                },
            } as never)

            const response = await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(200)

            expect(response.body).toEqual({
                state: 'completed',
                result: {
                    id: '00000000-0000-4000-8000-000000000005',
                    email,
                    reason: 'accepted_email',
                    localPart: 'test',
                    domain: 'example.com',
                    exists: true,
                    catchAll: null,
                    sources: ['mx'],
                },
                operation: {
                    id: operationId,
                    source: 'fresh',
                    observedAt: '2026-09-13T00:00:00.000Z',
                    cacheExpiresAt: '2026-09-14T00:00:00.000Z',
                    billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
                },
            })
        })

        it('preserves an unexpected read failure as a generic 500', async () => {
            service.getAsyncVerificationState.mockRejectedValue(new Error('private diagnostics'))

            const response = await request(app.getHttpServer()).get(`/verifyAsync/${operationId}`).expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
        })
    })
})
