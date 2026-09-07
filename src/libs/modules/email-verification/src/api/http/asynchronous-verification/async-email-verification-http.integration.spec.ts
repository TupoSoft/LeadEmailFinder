import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { EmailVerificationReason, JobState } from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard, CreditsService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    AsyncEmailVerificationService,
} from '../../../application/delivery/async/async-email-verification.service'
import { AsyncVerificationJobs } from '../../../application/delivery/async/async-verification-jobs'
import { VerificationTraceObserver } from '../../../application/verification-trace/verification-trace-observer'
import { AsyncEmailVerificationController } from './async-email-verification.controller'

const organizationId = '00000000-0000-4000-8000-000000000001'
const otherOrganizationId = '00000000-0000-4000-8000-000000000002'
const jobId = '00000000-0000-4000-8000-000000000003'
const requestId = '00000000-0000-4000-8000-000000000004'
const verificationId = '00000000-0000-4000-8000-000000000005'
const email = 'test@example.com'
const jobs: jest.Mocked<AsyncVerificationJobs> = { enqueue: jest.fn(), find: jest.fn() }
const credits: jest.Mocked<Pick<CreditsService, 'debit'>> = { debit: jest.fn() }
const traceObserver: jest.Mocked<VerificationTraceObserver> = {
    enqueued: jest.fn(),
    completed: jest.fn(),
    failed: jest.fn(),
    batchCompleted: jest.fn(),
}
const runPrincipal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer.example.test',
    subject: 'client-1',
    organizationId,
    membershipRole: 'member',
    permissions: ['verification:run', 'verification:read'],
    credentialId: 'credential-1',
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
                CreditGuard,
                {
                    provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
                    useValue: new AsyncEmailVerificationService(jobs, traceObserver),
                },
                { provide: CreditsService, useValue: credits },
            ],
        }).compile()

        app = moduleRef.createNestApplication({ logger: false })
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            if (principal) setAuthPrincipal(incoming, principal)
            incoming.id = requestId
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
        jobs.enqueue.mockReset().mockResolvedValue({ id: jobId })
        jobs.find.mockReset().mockResolvedValue({
            organizationId,
            readStatus: jest.fn().mockResolvedValue({ state: 'waiting' }),
        })
        credits.debit.mockReset().mockResolvedValue(undefined)
    })

    afterAll(async () => {
        await app.close()
    })

    function verify(input: Record<string, unknown> = { email }): request.Test {
        return request(app.getHttpServer()).post('/verifyAsync').send(input)
    }

    function expectOneDebit(owner = organizationId): void {
        expect(credits.debit).toHaveBeenCalledTimes(1)
        expect(credits.debit).toHaveBeenCalledWith(owner, 1, expect.any(String))
    }

    describe('POST /verifyAsync', () => {
        it('requires authentication before debit or dispatch', async () => {
            principal = undefined

            const response = await verify().expect(401)

            expect(response.body).toMatchObject({ message: 'Authentication principal is missing' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it('requires verification:run before debit or dispatch', async () => {
            principal = { ...runPrincipal, permissions: ['verification:read'] }

            const response = await verify().expect(403)

            expect(response.body).toMatchObject({ message: 'Missing required permission' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it('rejects zero credits with one debit attempt and no dispatch', async () => {
            credits.debit.mockRejectedValue(new InsufficientCreditsException(organizationId))

            const response = await verify().expect(402)

            expect(response.body).toEqual({ statusCode: 402, message: 'Insufficient credits' })
            expectOneDebit()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it.each([
            ['missing email', {}],
            ['malformed email', { email: 'not-an-email' }],
            ['localhost', { email: 'test@localhost' }],
            ['blocked company domain', { email: 'test@tuposoft.com' }],
            ['blocked product domain', { email: 'test@leademailfinder.com' }],
        ])('preserves validation for %s after one debit', async (_description, input) => {
            const response = await verify(input as Record<string, unknown>).expect(400)

            expect(response.body).toMatchObject({ message: ['email must be an email'] })
            expectOneDebit()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it('accepts one unchanged email with principal identity and a server trace', async () => {
            principal = { ...runPrincipal, organizationId: otherOrganizationId }

            const response = await verify({
                email: 'TEST@EXAMPLE.COM',
                organizationId: 'untrusted-organization',
                credentialId: 'untrusted-credential',
                requestId: 'untrusted-request',
            })
                .set('x-request-id', 'untrusted-header')
                .expect(202)

            expect(response.body).toEqual({ id: jobId })
            expectOneDebit(otherOrganizationId)
            expect(jobs.enqueue).toHaveBeenCalledTimes(1)
            expect(jobs.enqueue).toHaveBeenCalledWith(
                { email: 'TEST@EXAMPLE.COM', organizationId: otherOrganizationId, credentialId: 'credential-1' },
                expect.stringMatching(/^[0-9a-f-]{36}$/),
            )
            expect(traceObserver.enqueued).toHaveBeenCalledWith({ requestId, jobId, mode: 'async' })
            expect(jobs.find).not.toHaveBeenCalled()
        })

        it('preserves dispatch failures as a generic 500 after one debit and dispatch attempt', async () => {
            jobs.enqueue.mockRejectedValue(new Error('private queue diagnostics'))

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expectOneDebit()
            expect(jobs.enqueue).toHaveBeenCalledTimes(1)
        })

        it('preserves a missing queue ID as a generic 500 after one debit', async () => {
            jobs.enqueue.mockResolvedValue({ id: undefined })

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expectOneDebit()
            expect(jobs.enqueue).toHaveBeenCalledTimes(1)
        })

        it('does not dispatch when the credit adapter fails unexpectedly', async () => {
            credits.debit.mockRejectedValue(new Error('private ledger diagnostics'))

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expectOneDebit()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })
    })

    describe('GET /verifyAsync/:id', () => {
        it('requires authentication before queue lookup', async () => {
            principal = undefined

            await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(401)

            expect(jobs.find).not.toHaveBeenCalled()
            expect(credits.debit).not.toHaveBeenCalled()
        })

        it('requires verification:read before queue lookup', async () => {
            principal = { ...runPrincipal, permissions: ['verification:run'] }

            await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(403)

            expect(jobs.find).not.toHaveBeenCalled()
            expect(credits.debit).not.toHaveBeenCalled()
        })

        it('requires a UUID before queue lookup', async () => {
            const response = await request(app.getHttpServer()).get('/verifyAsync/not-a-uuid').expect(400)

            expect(response.body).toMatchObject({ message: ['id must be a UUID'] })
            expect(jobs.find).not.toHaveBeenCalled()
            expect(credits.debit).not.toHaveBeenCalled()
        })

        it('conceals a foreign job exactly like a missing job before reading state', async () => {
            jobs.find.mockResolvedValueOnce(undefined)
            const missing = await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(404)
            const readStatus = jest.fn()
            jobs.find.mockResolvedValueOnce({ organizationId: otherOrganizationId, readStatus })

            const foreign = await request(app.getHttpServer())
                .get(`/verifyAsync/${jobId}`)
                .query({ organizationId: otherOrganizationId })
                .expect(404)

            expect(foreign.body).toEqual(missing.body)
            expect(foreign.body).toEqual({
                statusCode: 404,
                message: `Job with id "${jobId}" not found.`,
                error: 'Not Found',
            })
            expect(readStatus).not.toHaveBeenCalled()
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it.each(Object.values(JobState).filter(state => state !== JobState.COMPLETED))(
            'returns only %s for an owned job without debit or dispatch',
            async state => {
                principal = { ...runPrincipal, permissions: ['verification:read'] }
                jobs.find.mockResolvedValue({
                    organizationId,
                    readStatus: jest.fn().mockResolvedValue({ state, result: { email } }),
                })

                const response = await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(200)

                expect(response.body).toEqual({ state })
                expect(jobs.find).toHaveBeenCalledWith(jobId)
                expect(credits.debit).not.toHaveBeenCalled()
                expect(jobs.enqueue).not.toHaveBeenCalled()
            },
        )

        it('exposes the completed verification ID and strips internal result fields on repeated reads', async () => {
            const readStatus = jest.fn().mockResolvedValue({
                state: 'completed',
                result: {
                    id: verificationId,
                    email,
                    reason: EmailVerificationReason.AcceptedEmail,
                    organizationId,
                    credentialId: 'private-credential',
                    internalDiagnostic: 'private queue diagnostics',
                },
            })
            jobs.find.mockResolvedValue({ organizationId, readStatus })

            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(200)

                expect(response.body).toEqual({
                    state: 'completed',
                    result: { id: verificationId, email, reason: EmailVerificationReason.AcceptedEmail },
                })
            }

            expect(readStatus).toHaveBeenCalledTimes(2)
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it('maps unsupported states to a generic 500 without revealing the state', async () => {
            jobs.find.mockResolvedValue({
                organizationId,
                readStatus: jest.fn().mockResolvedValue({ state: 'unexpected-private-diagnostics' }),
            })

            const response = await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })

        it('preserves a queue lookup failure as a generic 500', async () => {
            jobs.find.mockRejectedValue(new Error('private queue diagnostics'))

            const response = await request(app.getHttpServer()).get(`/verifyAsync/${jobId}`).expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(jobs.enqueue).not.toHaveBeenCalled()
        })
    })
})
