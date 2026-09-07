import { classes } from '@automapper/classes'
import { AutomapperModule } from '@automapper/nestjs'
import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditGuard, CreditsService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import {
    RUN_SYNCHRONOUS_VERIFICATION,
    RunSynchronousVerification,
    SynchronousVerificationCore,
} from '../../../application/delivery/synchronous/run-synchronous-verification'
import { OwnedEmailVerification } from '../../../domain/email-verification'
import { DomainVerificationForbiddenError } from '../../../domain/errors'
import { SyncEmailVerificationController } from './current/sync-email-verification.controller'
import { OldSyncEmailVerificationController } from './deprecated/old-sync-email-verification.controller'
import { OldSyncEmailVerificationProfile } from './deprecated/old-sync-email-verification.profile'
import { CatchAllStatus, DeliveryStatus } from './deprecated/old-email-verification.enums'

const organizationId = '00000000-0000-4000-8000-000000000001'
const otherOrganizationId = '00000000-0000-4000-8000-000000000002'
const verificationId = '00000000-0000-4000-8000-000000000003'
const operationId = '00000000-0000-4000-8000-000000000004'
const email = 'test@example.com'
const createdAt = new Date('2026-01-01T00:00:00.000Z')
const core: jest.Mocked<SynchronousVerificationCore> = { verify: jest.fn() }
const credits: jest.Mocked<Pick<CreditsService, 'debit'>> = { debit: jest.fn() }
const runPrincipal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer.example.test',
    subject: 'client-1',
    organizationId,
    membershipRole: 'member',
    permissions: ['verification:run', 'verification:read'],
    credentialId: 'credential-1',
}

function successfulVerification(): OwnedEmailVerification {
    return {
        id: verificationId,
        email,
        localPart: 'test',
        domain: 'example.com',
        format: EmailPatternEnum.First,
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        sources: [EmailVerificationSource.MX, 'linkedin'],
        mxDomain: 'mx.example.com',
        targetExchange: 'mail.example.com',
        createdAt,
        batchId: '00000000-0000-4000-8000-000000000005',
    }
}

const routes = [
    { method: 'post', mode: 'sync', successStatus: 201 },
    { method: 'get', mode: 'deprecated_sync', successStatus: 200 },
] as const

describe('synchronous verification HTTP contracts', () => {
    let app: INestApplication
    let principal: AuthPrincipal | undefined
    let requestId: string | undefined

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AutomapperModule.forRoot({ strategyInitializer: classes() })],
            controllers: [SyncEmailVerificationController, OldSyncEmailVerificationController],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                CreditGuard,
                OldSyncEmailVerificationProfile,
                { provide: RUN_SYNCHRONOUS_VERIFICATION, useValue: new RunSynchronousVerification(core) },
                { provide: CreditsService, useValue: credits },
            ],
        }).compile()

        app = moduleRef.createNestApplication({ logger: false })
        app.use((incoming: Request, _response: Response, next: NextFunction) => {
            if (principal) setAuthPrincipal(incoming, principal)
            if (requestId) incoming.id = requestId
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
        principal = runPrincipal
        requestId = undefined
        core.verify.mockReset().mockResolvedValue(successfulVerification())
        credits.debit.mockReset().mockResolvedValue(undefined)
    })

    afterAll(async () => {
        await app.close()
    })

    describe.each(routes)('$method /verify', ({ method, mode, successStatus }) => {
        function verify(input: Record<string, unknown> = { email }): request.Test {
            const pending = request(app.getHttpServer())[method]('/verify')
            return method === 'post' ? pending.send(input) : pending.query(input)
        }

        function expectOneDebit(owner = organizationId): void {
            expect(credits.debit).toHaveBeenCalledTimes(1)
            expect(credits.debit).toHaveBeenCalledWith(owner, 1, expect.any(String))
        }

        it('requires authentication before debiting or verifying', async () => {
            principal = undefined

            const response = await verify().expect(401)

            expect(response.body).toMatchObject({ message: 'Authentication principal is missing' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(core.verify).not.toHaveBeenCalled()
        })

        it('requires verification:run before debiting or verifying', async () => {
            principal = { ...runPrincipal, permissions: ['verification:read'] }

            const response = await verify().expect(403)

            expect(response.body).toMatchObject({ message: 'Missing required permission' })
            expect(credits.debit).not.toHaveBeenCalled()
            expect(core.verify).not.toHaveBeenCalled()
        })

        it('rejects zero credits with one debit attempt and no verification', async () => {
            credits.debit.mockRejectedValue(new InsufficientCreditsException(organizationId))

            const response = await verify().expect(402)

            expect(response.body).toEqual({ statusCode: 402, message: 'Insufficient credits' })
            expectOneDebit()
            expect(core.verify).not.toHaveBeenCalled()
        })

        it.each([
            ['missing email', {}],
            ['malformed email', { email: 'not-an-email' }],
            ['localhost', { email: 'test@localhost' }],
            ['blocked company domain', { email: 'test@tuposoft.com' }],
            ['blocked product domain', { email: 'test@leademailfinder.com' }],
        ])('preserves validation for %s after the credit guard', async (_description, input) => {
            const response = await verify(input as Record<string, unknown>).expect(400)

            expect(response.body).toMatchObject({ message: ['email must be an email'] })
            expectOneDebit()
            expect(core.verify).not.toHaveBeenCalled()
        })

        it('uses the principal organization and server trace while normalizing the email', async () => {
            principal = { ...runPrincipal, organizationId: otherOrganizationId }
            requestId = operationId

            await verify({
                email: 'TEST@EXAMPLE.COM',
                organizationId: 'untrusted-organization',
                trace: { operationId: 'untrusted-operation', mode: 'batch' },
            }).expect(successStatus)

            expectOneDebit(otherOrganizationId)
            expect(core.verify).toHaveBeenCalledTimes(1)
            expect(core.verify).toHaveBeenCalledWith({
                organizationId: otherOrganizationId,
                email,
                trace: { operationId, mode },
            })
        })

        it('debits exactly once and retains its response schema without a request trace', async () => {
            const response = await verify().expect(successStatus)

            expectOneDebit()
            expect(core.verify).toHaveBeenCalledTimes(1)
            expect(core.verify).toHaveBeenCalledWith({ organizationId, email, trace: undefined })
            const commonFields = {
                email,
                localPart: 'test',
                domain: 'example.com',
                format: EmailPatternEnum.First,
                reason: EmailVerificationReason.AcceptedEmail,
                mxDomain: 'mx.example.com',
                targetExchange: 'mail.example.com',
            }
            expect(response.body).toEqual(
                method === 'post'
                    ? {
                          ...commonFields,
                          id: verificationId,
                          exists: true,
                          catchAll: false,
                          sources: [EmailVerificationSource.MX, 'linkedin'],
                      }
                    : {
                          ...commonFields,
                          deliveryStatus: DeliveryStatus.Accepted,
                          catchAll: CatchAllStatus.Disabled,
                          verifiedAt: createdAt.toISOString(),
                      },
            )
        })

        it.each([
            {
                exists: true,
                catchAll: true,
                deliveryStatus: DeliveryStatus.Accepted,
                legacyCatchAll: CatchAllStatus.Enabled,
                reason: EmailVerificationReason.AcceptedEmail,
            },
            {
                exists: false,
                catchAll: false,
                deliveryStatus: DeliveryStatus.Rejected,
                legacyCatchAll: CatchAllStatus.Disabled,
                reason: EmailVerificationReason.RejectedEmail,
            },
            {
                exists: null,
                catchAll: null,
                deliveryStatus: DeliveryStatus.NotProcessed,
                legacyCatchAll: CatchAllStatus.Unknown,
                reason: EmailVerificationReason.SecureTransportUnavailable,
            },
        ])('preserves exists=$exists and catchAll=$catchAll outcomes', async outcome => {
            core.verify.mockResolvedValue({
                ...successfulVerification(),
                exists: outcome.exists,
                catchAll: outcome.catchAll,
                reason: outcome.reason,
            })

            const response = await verify().expect(successStatus)

            expectOneDebit()
            expect(core.verify).toHaveBeenCalledTimes(1)
            expect(response.body).toMatchObject(
                method === 'post'
                    ? { exists: outcome.exists, catchAll: outcome.catchAll, reason: outcome.reason }
                    : {
                          deliveryStatus: outcome.deliveryStatus,
                          catchAll: outcome.legacyCatchAll,
                          reason: outcome.reason,
                          verifiedAt: createdAt.toISOString(),
                      },
            )
        })

        it.each([
            ['prohibited domain', new DomainVerificationForbiddenError('example.com')],
            ['verification adapter failure', new Error('private provider diagnostics')],
        ])('retains the existing HTTP 500 response for %s after one debit', async (_description, error) => {
            core.verify.mockRejectedValue(error)

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expectOneDebit()
            expect(core.verify).toHaveBeenCalledTimes(1)
        })

        it('does not verify when the credit adapter fails unexpectedly', async () => {
            credits.debit.mockRejectedValue(new Error('private ledger diagnostics'))

            const response = await verify().expect(500)

            expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
            expectOneDebit()
            expect(core.verify).not.toHaveBeenCalled()
        })
    })

    it('keeps only GET /verify deprecated in Swagger and preserves the success statuses', () => {
        const document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
        const route = document.paths['/verify']

        expect(route.get?.deprecated).toBe(true)
        expect(route.post?.deprecated).not.toBe(true)
        expect(route.get?.responses).toHaveProperty('200')
        expect(route.post?.responses).toHaveProperty('201')
    })
})
