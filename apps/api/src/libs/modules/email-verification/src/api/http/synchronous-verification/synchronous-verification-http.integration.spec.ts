import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
    SynchronousVerificationOutcome,
} from '../../../application/delivery/synchronous/run-synchronous-verification'
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
import { SyncEmailVerificationController } from './current/sync-email-verification.controller'

const organizationId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000004'
const email = 'test@example.com'
const synchronousVerification: jest.Mocked<Pick<RunSynchronousVerification, 'execute'>> = { execute: jest.fn() }
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

describe('synchronous verification HTTP contracts', () => {
    let app: INestApplication
    let principal: AuthPrincipal | undefined

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [SyncEmailVerificationController],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                VerificationRateLimitGuard,
                { provide: RUN_SYNCHRONOUS_VERIFICATION, useValue: synchronousVerification },
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
        synchronousVerification.execute.mockResolvedValue({
            kind: 'completed',
            result: {
                id: requestId,
                email,
                localPart: 'test',
                domain: 'example.com',
                exists: true,
                catchAll: false,
                reason: 'accepted_email',
                sources: ['mx'],
                evidenceObservedAt: new Date('2026-01-01T00:00:00.000Z'),
            } as never,
            operation: {
                id: requestId,
                source: 'fresh',
                observedAt: '2026-01-01T00:00:00.000Z',
                cacheExpiresAt: '2026-01-02T00:00:00.000Z',
                billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
            },
        } satisfies SynchronousVerificationOutcome)
    })

    afterAll(async () => {
        await app.close()
    })

    describe('POST /verify', () => {
        function verify(input: Record<string, unknown> = { email }): request.Test {
            return request(app.getHttpServer()).post('/verify').send(input)
        }

        it('requires authentication before rate limiting or admission', async () => {
            principal = undefined

            const response = await verify().expect(401)

            expect(response.body).toMatchObject({ message: 'Authentication principal is missing' })
            expect(limiter.tryConsume).not.toHaveBeenCalled()
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
        })

        it('requires verification:run before rate limiting or admission', async () => {
            principal = { ...runPrincipal, permissions: ['verification:read'] }

            const response = await verify().expect(403)

            expect(response.body).toMatchObject({ message: 'Missing required permission' })
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
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
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
        })

        it('rejects an over-limit organization with 429 and an integer Retry-After before admission', async () => {
            limiter.tryConsume.mockResolvedValue({ allowed: false, retryAfterMs: 2_500 })

            const response = await verify().expect(429)

            expect(response.body).toMatchObject({ message: 'rate_limited' })
            expect(response.headers['retry-after']).toBe('3')
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
        })

        it('fails safe with 503 when the limiter cannot respond in time', async () => {
            limiter.tryConsume.mockRejectedValue(new VerificationSubmissionLimiterUnavailableError('tryConsume'))

            const response = await verify().expect(503)

            expect(response.body).toMatchObject({ message: 'rate_limit_unavailable' })
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
        })

        it('rejects a malformed Idempotency-Key with 400 before calling the driver', async () => {
            const response = await verify().set('Idempotency-Key', 'not-a-uuid').expect(400)

            expect(response.body).toMatchObject({ message: 'invalid_idempotency_key' })
            expect(synchronousVerification.execute).not.toHaveBeenCalled()
        })

        it('forwards an old Idempotency-Key to the driver instead of rejecting it before a stored-request lookup', async () => {
            // An old key might still match an existing stored request within its seven-day replay window — only
            // admission's own lookup can tell. Only the driver's own `conflict/key-expired` outcome (see below)
            // may produce 410 for a key admission determines has genuinely expired with no match.
            const expiredKey = buildUuidV7(Date.now() - 25 * 60 * 60 * 1000)

            await verify().set('Idempotency-Key', expiredKey).expect(201)

            expect(synchronousVerification.execute).toHaveBeenCalledWith(
                expect.objectContaining({ clientRequestKey: expiredKey }),
            )
        })

        it('admits with the caller organization and forwards a valid Idempotency-Key', async () => {
            principal = { ...runPrincipal, organizationId: 'other-organization' }
            const key = buildUuidV7(Date.now())

            await verify({ email: 'TEST@EXAMPLE.COM', organizationId: 'untrusted-organization' })
                .set('Idempotency-Key', key)
                .expect(201)

            expect(synchronousVerification.execute).toHaveBeenCalledWith({
                organizationId: 'other-organization',
                email: 'TEST@EXAMPLE.COM',
                clientRequestKey: key,
            })
        })

        it('returns 201 with the completed result and operation metadata', async () => {
            const response = await verify().expect(201)

            expect(response.body).toEqual({
                id: requestId,
                email,
                localPart: 'test',
                domain: 'example.com',
                exists: true,
                catchAll: false,
                reason: 'accepted_email',
                sources: ['mx'],
                evidenceObservedAt: '2026-01-01T00:00:00.000Z',
                operation: {
                    id: requestId,
                    source: 'fresh',
                    observedAt: '2026-01-01T00:00:00.000Z',
                    cacheExpiresAt: '2026-01-02T00:00:00.000Z',
                    billing: { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' },
                },
            })
        })

        it('returns 202 with a Location header when the budget is exhausted', async () => {
            synchronousVerification.execute.mockResolvedValue({ kind: 'accepted', id: requestId })

            const response = await verify().expect(202)

            expect(response.body).toEqual({ id: requestId })
            expect(response.headers.location).toBe(`/verifyAsync/${requestId}`)
        })

        it('maps insufficient-funds to 402', async () => {
            synchronousVerification.execute.mockResolvedValue({ kind: 'insufficient-funds' })

            const response = await verify().expect(402)

            expect(response.body).toMatchObject({ message: 'insufficient_credits' })
        })

        it('maps a key-mismatch conflict to 409', async () => {
            synchronousVerification.execute.mockResolvedValue({ kind: 'conflict', reason: 'key-mismatch' })

            const response = await verify().expect(409)

            expect(response.body).toMatchObject({ message: 'idempotency_key_conflict' })
        })

        it('maps address-cooldown to 429 with an integer Retry-After', async () => {
            synchronousVerification.execute.mockResolvedValue({ kind: 'address-cooldown', retryAfterMs: 30_500 })

            const response = await verify().expect(429)

            expect(response.body).toMatchObject({ message: 'verification_cooldown' })
            expect(response.headers['retry-after']).toBe('31')
        })

        it('preserves an unexpected driver failure as a generic 500', async () => {
            synchronousVerification.execute.mockRejectedValue(new Error('private diagnostics'))

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
        })
    })

    it.each([1, 0])('returns 404 for authenticated GET /verify with %i credits and performs no work', async () => {
        const response = await request(app.getHttpServer()).get('/verify').query({ email }).expect(404)

        expect(response.body).toMatchObject({ statusCode: 404, error: 'Not Found' })
        expect(synchronousVerification.execute).not.toHaveBeenCalled()
    })

    it('omits GET /verify from Swagger and preserves the current POST success metadata', () => {
        const document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
        const route = document.paths['/verify']

        expect(route).not.toHaveProperty('get')
        expect(route).toHaveProperty('post')
        expect(route.post?.deprecated).not.toBe(true)
        expect(route.post?.responses).toHaveProperty('201')
    })
})
