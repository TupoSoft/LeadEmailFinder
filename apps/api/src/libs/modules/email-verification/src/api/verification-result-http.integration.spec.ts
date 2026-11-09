import { ClassSerializerInterceptor, INestApplication, MiddlewareConsumer, Module } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { EntityManager } from 'typeorm'
import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { VERIFICATION_RESULT_READER, VerificationResultLookup } from '../application/verification-result-reader'
import { TypeOrmVerificationResultReader } from '../infrastructure/typeorm-verification-result-reader'
import { EmailVerificationEntity } from '../infrastructure/persistence/typeorm/email-verification.entity'
import { VerificationSettlementIntentionEntity } from '../infrastructure/persistence/typeorm/verification-settlement-intention.entity'
import { VerificationResultsController } from './verification-results.controller'

const organizationId = '00000000-0000-4000-8000-000000000010'
const foreignOrganizationId = '00000000-0000-4000-8000-000000000020'
const ownedId = '00000000-0000-4000-8000-000000000001'
const foreignId = '00000000-0000-4000-8000-000000000002'
const missingId = '00000000-0000-4000-8000-000000000003'
const createdAt = new Date('2026-01-01T00:00:00.000Z')
const records: EmailVerificationEntity[] = [
    {
        id: ownedId,
        organizationId,
        email: 'owned@example.test',
        domain: 'example.test',
        localPart: 'owned',
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        sources: [EmailVerificationSource.MX],
        createdAt,
        batchId: '00000000-0000-4000-8000-000000000030',
        verificationQuality: 'conclusive_positive',
        evidenceObservedAt: createdAt,
        evidencePolicyVersion: 1,
    },
    {
        id: foreignId,
        organizationId: foreignOrganizationId,
        email: 'foreign@example.test',
        domain: 'example.test',
        localPart: 'foreign',
        exists: false,
        catchAll: false,
        reason: EmailVerificationReason.RejectedEmail,
        sources: [EmailVerificationSource.MX],
        createdAt,
        verificationQuality: 'conclusive_negative',
        evidenceObservedAt: createdAt,
        evidencePolicyVersion: 1,
    },
]
const repository = {
    findOneBy: jest.fn((entityClass: unknown, where: unknown) => {
        if (entityClass === VerificationSettlementIntentionEntity) return Promise.resolve(null)
        const lookup = where as VerificationResultLookup
        return Promise.resolve(
            records.find(record => record.id === lookup.id && record.organizationId === lookup.organizationId) ?? null,
        )
    }),
}
const readPrincipal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer',
    subject: 'client-1',
    organizationId,
    membershipRole: 'member',
    permissions: ['verification:read'],
    credentialId: 'credential-1',
}
let principal: AuthPrincipal | undefined

class FixturePrincipalMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        if (principal) setAuthPrincipal(req, principal)
        next()
    }
}

@Module({
    controllers: [VerificationResultsController],
    providers: [
        Reflector,
        RolePermissionPolicy,
        PermissionsGuard,
        {
            provide: VERIFICATION_RESULT_READER,
            useValue: new TypeOrmVerificationResultReader(repository as unknown as Pick<EntityManager, 'findOneBy'>),
        },
    ],
})
class VerificationResultHttpTestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(FixturePrincipalMiddleware).forRoutes('*')
    }
}

describe('GET /verifications/:id', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [VerificationResultHttpTestModule] }).compile()
        app = moduleRef.createNestApplication()
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()
    })

    beforeEach(() => {
        principal = readPrincipal
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await app.close()
    })

    it('returns the persisted UUID and current result DTO for an owned result', async () => {
        const response = await request(app.getHttpServer()).get(`/verifications/${ownedId}`).expect(200)

        expect(response.body).toEqual({
            id: ownedId,
            email: 'owned@example.test',
            domain: 'example.test',
            localPart: 'owned',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
            evidenceObservedAt: createdAt.toISOString(),
        })
        expect(repository.findOneBy).toHaveBeenCalledWith(EmailVerificationEntity, { id: ownedId, organizationId })
    })

    it('conceals a foreign result exactly like a missing result', async () => {
        const foreign = await request(app.getHttpServer()).get(`/verifications/${foreignId}`).expect(404)
        const missing = await request(app.getHttpServer()).get(`/verifications/${missingId}`).expect(404)

        expect(foreign.body).toEqual(missing.body)
        expect(foreign.body).toEqual({
            statusCode: 404,
            message: 'Verification result not found',
            error: 'Not Found',
        })
        expect(repository.findOneBy).toHaveBeenNthCalledWith(1, EmailVerificationEntity, { id: foreignId, organizationId })
        expect(repository.findOneBy).toHaveBeenNthCalledWith(2, EmailVerificationEntity, { id: missingId, organizationId })
    })

    it('requires authentication before reading persistence', async () => {
        principal = undefined

        await request(app.getHttpServer()).get(`/verifications/${ownedId}`).expect(401)

        expect(repository.findOneBy).not.toHaveBeenCalled()
    })

    it('requires verification:read before reading persistence', async () => {
        principal = { ...readPrincipal, permissions: ['verification:run'] }

        await request(app.getHttpServer()).get(`/verifications/${ownedId}`).expect(403)

        expect(repository.findOneBy).not.toHaveBeenCalled()
    })

    it('rejects a malformed UUID before reading persistence', async () => {
        await request(app.getHttpServer()).get('/verifications/not-a-uuid').expect(400)

        expect(repository.findOneBy).not.toHaveBeenCalled()
    })

    it('does not allow query parameters to override organization ownership', async () => {
        await request(app.getHttpServer())
            .get(`/verifications/${foreignId}`)
            .query({ organizationId: foreignOrganizationId, email: 'foreign@example.test', requestId: ownedId })
            .expect(404)

        expect(repository.findOneBy).toHaveBeenCalledWith(EmailVerificationEntity, { id: foreignId, organizationId })
    })

    it('does not expose listing or lookup by email or request ID', async () => {
        await request(app.getHttpServer())
            .get('/verifications')
            .query({ email: 'owned@example.test', requestId: ownedId })
            .expect(404)

        expect(repository.findOneBy).not.toHaveBeenCalled()
    })
})
