import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { randomUUID } from 'node:crypto'
import type { DestinationStream } from 'pino'
import { Logger, LoggerModule } from 'pino-nestjs'
import request from 'supertest'
import type { NextFunction, Request, Response } from 'express'
import type { Job, Queue } from 'bullmq'
import {
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationResultDto,
} from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard, CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import type { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { createPiiSafePinoHttpOptions } from '../../../../../../lead-email-finder-api/src/pii-safe-logger-options'
import { configurePiiSafeRequestLogging } from '../../../../../../lead-email-finder-api/src/configure-pii-safe-request-logging'
import { EmailVerificationOrchestrator } from '../../application/email-verification.service'
import { DomainPolicyService } from '../../application/domain-policy.service'
import { EmailAdministrationService } from '../../application/email-administration.service'
import { MailboxVerificationService } from '../../application/mailbox-verification.service'
import { VerificationStore } from '../../application/ports/verification-store'
import { EmailVerification } from '../../domain/email-verification'
import { SyncEmailVerificationController } from '../../sync-email-verification/sync-email-verification.controller'
import { OldSyncEmailVerificationController } from '../../old-sync-email-verification/old-sync-email-verification.controller'
import { OldSyncEmailVerificationProfile } from '../../old-sync-email-verification/old-sync-email-verification.profile'
import { AsyncEmailVerificationController } from '../../async-email-verification/async-email-verification.controller'
import { AsyncEmailVerificationServiceImpl } from '../../async-email-verification/async-email-verification-service-impl.service'
import { AsyncEmailVerificationProcessor } from '../../async-email-verification/async-email-verification.processor'
import { AsyncEmailVerificationJobData } from '../../async-email-verification/async-email-verification-job-data.interface'
import { ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN } from '../../async-email-verification/async-email-verification.constants'
import { LoggingVerificationTraceObserver } from './logging-verification-trace-observer'

const principal: AuthPrincipal = {
    organizationId: randomUUID(),
    credentialId: randomUUID(),
    credentialKind: 'service_client',
    issuer: 'https://issuer',
    subject: 'client',
    membershipRole: 'member',
    permissions: ['verification:run', 'verification:read'],
}
const localPart = 'trace-sentinel-' + randomUUID()
const domain = 'trace-private-domain.test'
const email = localPart + '@' + domain
const mx = 'private-mx.' + domain
const remoteText = '550 private SMTP provider response ' + email
const attackerId = 'inbound-secret-' + randomUUID()
const captured: Record<string, unknown>[] = []
const destination: DestinationStream = {
    write: line => {
        captured.push(JSON.parse(line))
    },
}
const persisted: EmailVerification[] = []
const verifier = { verify: jest.fn() }
const debit = jest.fn().mockResolvedValue(undefined)
const jobs = new Map<string, Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>>()
const queue = {
    add: jest.fn((_name: string, data: AsyncEmailVerificationJobData, options: { jobId: string }) => {
        const job = { id: options.jobId, data, attemptsMade: 0, getState: () => Promise.resolve('completed') } as Job<
            AsyncEmailVerificationJobData,
            IEmailVerificationResponseDto
        >
        jobs.set(job.id!, job)
        return Promise.resolve(job)
    }),
    getJob: (id: string) => Promise.resolve(jobs.get(id)),
}

function accepted(): IEmailVerificationResultDto {
    return {
        email,
        localPart,
        domain,
        mxDomain: mx,
        targetExchange: mx,
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        sources: [],
    }
}

describe('captured verification trace chain', () => {
    let app: INestApplication
    let processor: AsyncEmailVerificationProcessor

    beforeAll(async () => {
        const observer = new LoggingVerificationTraceObserver()
        const store: Pick<VerificationStore, 'create'> = {
            create: (organizationId: string, record: unknown): Promise<EmailVerification> => {
                const saved = { ...(record as object), organizationId, id: randomUUID(), createdAt: new Date() } as EmailVerification
                persisted.push(saved)
                return Promise.resolve(saved)
            },
        }
        const service = new EmailVerificationOrchestrator(
            verifier as unknown as MailboxVerificationService,
            store as VerificationStore,
            { upsertEmail: jest.fn().mockResolvedValue(undefined) } as unknown as EmailAdministrationService,
            { isVerificationAllowed: jest.fn().mockResolvedValue(true) } as unknown as DomainPolicyService,
            observer,
        )
        const asyncService = new AsyncEmailVerificationServiceImpl(
            queue as unknown as Queue<
                AsyncEmailVerificationJobData,
                IEmailVerificationResponseDto,
                'async-email-verification'
            >,
            observer,
        )
        processor = new AsyncEmailVerificationProcessor(service)
        const moduleRef = await Test.createTestingModule({
            imports: [
                LoggerModule.forRoot({ useExisting: true, pinoHttp: [createPiiSafePinoHttpOptions(), destination] }),
                AutomapperModule.forRoot({ strategyInitializer: classes() }),
            ],
            controllers: [
                SyncEmailVerificationController,
                OldSyncEmailVerificationController,
                AsyncEmailVerificationController,
            ],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                CreditGuard,
                OldSyncEmailVerificationProfile,
                { provide: 'EmailVerificationServiceToken', useValue: service },
                { provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN, useValue: asyncService },
                { provide: CreditsService, useValue: { debit } },
            ],
        }).compile()
        app = moduleRef.createNestApplication()
        configurePiiSafeRequestLogging(app, destination)
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            setAuthPrincipal(incoming, principal)
            next()
        })
        app.useLogger(app.get(Logger))
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
        captured.length = 0
        persisted.length = 0
        jobs.clear()
        jest.clearAllMocks()
        verifier.verify.mockResolvedValue(accepted())
    })
    afterAll(async () => {
        await app.close()
    })

    function assertPrivate(): void {
        const output = JSON.stringify(captured)
        for (const secret of [
            email,
            encodeURIComponent(email),
            localPart,
            domain,
            mx,
            remoteText,
            attackerId,
            'credential-secret',
            'cookie-secret',
            '198.51.100.55',
        ])
            expect(output).not.toContain(secret)
    }

    it.each(['sync', 'deprecated_sync'])(
        'links the %s response header to its saved result without logging input',
        async mode => {
            const pending =
                mode === 'sync'
                    ? request(app.getHttpServer()).post('/verify').send({ email, ignoredSecret: remoteText })
                    : request(app.getHttpServer()).get('/verify').query({ email })
            const response = await pending
                .set('X-Request-ID', attackerId)
                .set('Authorization', 'Bearer credential-secret')
                .set('Cookie', 'cookie-secret')
                .set('X-Forwarded-For', '198.51.100.55')
                .expect(mode === 'sync' ? 201 : 200)
            const body = response.body as Record<string, unknown>
            const id = response.headers['x-request-id']
            expect(captured).toContainEqual(
                expect.objectContaining({
                    event: 'verification_completed',
                    operationId: id,
                    mode,
                    verificationId: persisted[0].id,
                    reason: 'accepted_email',
                }),
            )
            expect(captured).toContainEqual(
                expect.objectContaining({
                    req: { id, method: mode === 'sync' ? 'POST' : 'GET', path: '/verify' },
                    responseTime: expect.any(Number),
                }),
            )
            if (mode === 'sync') expect(body.id).toBe(persisted[0].id)
            else {
                expect(response.body).not.toHaveProperty('id')
                expect(body.email).toBe(email)
                expect(body.verifiedAt).toBe(persisted[0].createdAt.toISOString())
            }
            expect(persisted[0]).not.toHaveProperty('trace')
            expect(debit).toHaveBeenCalledTimes(1)
            assertPrivate()
        },
    )

    it('keeps expected rejection separate from unexpected provider failure without copying diagnostics', async () => {
        verifier.verify.mockResolvedValueOnce({
            ...accepted(),
            exists: false,
            reason: EmailVerificationReason.RejectedEmail,
        })
        const rejected = await request(app.getHttpServer()).post('/verify').send({ email }).expect(201)
        expect(captured).toContainEqual(
            expect.objectContaining({
                event: 'verification_completed',
                operationId: rejected.headers['x-request-id'],
                reason: 'rejected_email',
            }),
        )
        verifier.verify.mockRejectedValueOnce(new Error(remoteText))
        const failed = await request(app.getHttpServer()).post('/verify').send({ email }).expect(500)
        expect(captured).toContainEqual(
            expect.objectContaining({
                event: 'verification_failed',
                operationId: failed.headers['x-request-id'],
                stage: 'verification_probe',
                errorType: 'Error',
            }),
        )
        assertPrivate()
    })

    it('links async HTTP dispatch, stable retry IDs, persisted results, and completed polling', async () => {
        const response = await request(app.getHttpServer())
            .post('/verifyAsync')
            .send({ email })
            .set('X-Request-ID', attackerId)
            .expect(202)
        const jobId = (response.body as { id: string }).id
        expect(Object.keys(response.body)).toEqual(['id'])
        expect(captured).toContainEqual(
            expect.objectContaining({
                event: 'verification_enqueued',
                requestId: response.headers['x-request-id'],
                jobId,
                mode: 'async',
            }),
        )
        const job = jobs.get(jobId)!
        expect(job.data).not.toHaveProperty('requestId')
        verifier.verify.mockResolvedValueOnce({ ...accepted(), reason: EmailVerificationReason.TemporarilyBlocked })
        await expect(processor.process(job)).rejects.toThrow()
        job.attemptsMade = 1
        job.returnvalue = await processor.process(job)
        const completed = await request(app.getHttpServer())
            .get('/verifyAsync/' + jobId)
            .expect(200)
        expect((completed.body as { result: IEmailVerificationResponseDto }).result.id).toBe(persisted[1].id)
        const events = captured.filter(line => line.event === 'verification_completed')
        expect(events).toHaveLength(2)
        expect(events[0]).toMatchObject({
            operationId: jobId,
            jobId,
            mode: 'async',
            attempt: 1,
            reason: 'temporarily_blocked',
        })
        expect(events[1]).toMatchObject({
            operationId: jobId,
            jobId,
            mode: 'async',
            attempt: 2,
            verificationId: persisted[1].id,
        })
        expect(debit).toHaveBeenCalledTimes(1)
        assertPrivate()
    })
})
