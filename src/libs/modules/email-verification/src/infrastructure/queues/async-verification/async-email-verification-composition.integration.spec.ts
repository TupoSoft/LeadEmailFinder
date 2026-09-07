import { BullModule, getQueueToken } from '@nestjs/bullmq'
import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Queue } from 'bullmq'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { EmailVerificationReason, IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard, CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import type { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AsyncEmailVerificationController } from '../../../api/http/asynchronous-verification/async-email-verification.controller'
import { EmailVerificationOrchestrator } from '../../../application/email-verification.service'
import { EmailVerificationCoreModule } from '../../email-verification-core.module'
import { AsyncEmailVerificationModule } from './async-email-verification.module'
import { ASYNC_EMAIL_VERIFICATION_QUEUE_NAME } from './async-email-verification-queue.config'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'

const redisUrl = process.env.TEST_REDIS_URL
const describeWithRedis = redisUrl ? describe : describe.skip
const core = { verify: jest.fn() }

@Module({
    providers: [{ provide: EmailVerificationOrchestrator, useValue: core }],
    exports: [EmailVerificationOrchestrator],
})
class FixtureVerificationCoreModule {}

describeWithRedis('async production Nest composition with Redis', () => {
    let app: INestApplication
    let queue: Queue<AsyncEmailVerificationJobData, IEmailVerificationResponseDto, 'async-email-verification'>
    const debit = jest.fn().mockResolvedValue(undefined)
    const principal: AuthPrincipal = {
        organizationId: randomUUID(),
        credentialId: randomUUID(),
        credentialKind: 'service_client',
        issuer: 'https://issuer.example.test',
        subject: 'fixture-client',
        membershipRole: 'member',
        permissions: ['verification:run', 'verification:read'],
    }

    beforeAll(async () => {
        const url = new URL(redisUrl!)
        const moduleRef = await Test.createTestingModule({
            imports: [
                BullModule.forRoot({
                    prefix: `issue460-composition-${randomUUID()}`,
                    connection: {
                        host: url.hostname,
                        port: Number(url.port || 6379),
                        username: url.username ? decodeURIComponent(url.username) : undefined,
                        password: url.password ? decodeURIComponent(url.password) : undefined,
                        db: Number(url.pathname.slice(1) || 0),
                        ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
                    },
                }),
                AsyncEmailVerificationModule,
            ],
            controllers: [AsyncEmailVerificationController],
            providers: [
                PermissionsGuard,
                RolePermissionPolicy,
                CreditGuard,
                { provide: CreditsService, useValue: { debit } },
            ],
        })
            .overrideModule(EmailVerificationCoreModule)
            .useModule(FixtureVerificationCoreModule)
            .compile()
        app = moduleRef.createNestApplication({ logger: false })
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            setAuthPrincipal(incoming, principal)
            next()
        })
        app.useGlobalPipes(new ValidationPipe())
        app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector), { strategy: 'excludeAll' }))
        await app.init()
        queue = app.get(getQueueToken(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME))
    })

    afterAll(async () => {
        await queue?.obliterate({ force: true })
        await app?.close()
    })

    it('enqueues through HTTP and the registered worker completes once without another debit on polling', async () => {
        const publicResult = {
            id: randomUUID(),
            email: 'person@lef.test',
            localPart: 'person',
            domain: 'lef.test',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [],
        }
        const result = { ...publicResult, createdAt: new Date('2026-09-07T00:00:00Z') }
        core.verify.mockResolvedValue(result)
        const submitted = await request(app.getHttpServer())
            .post('/verifyAsync')
            .send({ email: result.email })
            .expect(202)
        const id = (submitted.body as { id: string }).id
        const deadline = Date.now() + 5000
        let completed: request.Response
        do {
            completed = await request(app.getHttpServer()).get(`/verifyAsync/${id}`).expect(200)
            if ((completed.body as { state: string }).state === 'completed') break
            await new Promise(resolve => setTimeout(resolve, 20))
        } while (Date.now() < deadline)
        expect(completed.body).toEqual({ state: 'completed', result: publicResult })
        const repeated = await request(app.getHttpServer()).get(`/verifyAsync/${id}`).expect(200)
        expect(repeated.body).toEqual(completed.body)
        const job = await queue.getJob(id)
        expect(job?.data).toEqual({
            email: result.email,
            organizationId: principal.organizationId,
            credentialId: principal.credentialId,
        })
        expect(job?.opts).toMatchObject({ attempts: 5, backoff: { type: 'async-email-verification' }, jobId: id })
        expect(core.verify).toHaveBeenCalledTimes(1)
        expect(core.verify).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: principal.organizationId,
                email: result.email,
                trace: expect.objectContaining({ jobId: id, attempt: 1 }),
            }),
        )
        expect(debit).toHaveBeenCalledTimes(1)
        expect(debit).toHaveBeenCalledWith(principal.organizationId, 1, expect.any(String))
        expect(await queue.getJobCounts('completed', 'failed', 'waiting', 'active')).toMatchObject({
            completed: 1,
            failed: 0,
            waiting: 0,
            active: 0,
        })
    })
})
