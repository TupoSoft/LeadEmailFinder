import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { NextFunction, Request, Response } from 'express'
import { Readable } from 'node:stream'
import request from 'supertest'
import { PermissionsGuard, RolePermissionPolicy, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { BatchJobStep } from '../../../domain/batch-job'
import {
    BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
    BatchEmailVerificationService,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { BatchResultReader, BatchResultUnavailableError } from '../../../application/delivery/batch/batch-result-reader'
import { BatchAdmissionStore } from '../../../application/delivery/batch/batch-admission-store'
import { BullBatchJobs } from '../../../infrastructure/queues/batch-verification/bull-batch-jobs'
import { BatchEmailVerificationController } from './batch-email-verification.controller'

const organizationId = '00000000-0000-4000-8000-000000000001'
const jobId = '00000000-0000-4000-8000-000000000002'
const principalFixture: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer.example.test',
    subject: 'client-1',
    organizationId,
    membershipRole: 'member',
    permissions: ['verification:run', 'verification:read'],
    credentialId: 'credential-1',
}

describe('batch verification HTTP status and download contracts', () => {
    let app: INestApplication
    let principal: AuthPrincipal | undefined
    const queue = { getJob: jest.fn(), add: jest.fn() }
    const resultReader: jest.Mocked<BatchResultReader> = { read: jest.fn() }
    const admissions: jest.Mocked<BatchAdmissionStore> = {
        createOrReplay: jest.fn(),
        findById: jest.fn(),
        findByClientKey: jest.fn(),
        updateState: jest.fn(),
        insertUniqueAddresses: jest.fn(),
        pageUniqueAddresses: jest.fn(),
        recordAdmissionOutcome: jest.fn(),
        ensurePayerRequestId: jest.fn(),
        countUnsettledAddresses: jest.fn(),
        getStatusCounts: jest.fn(),
    }

    function rawJob(state: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            id: jobId,
            data: { organizationId, step: BatchJobStep.AwaitSettlement },
            getState: jest.fn().mockResolvedValue(state),
            failedReason: 'private CSV parser and storage diagnostics',
            stacktrace: ['private stack'],
            ...extra,
        }
    }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [BatchEmailVerificationController],
            providers: [
                RolePermissionPolicy,
                PermissionsGuard,
                {
                    provide: BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
                    useValue: new BatchEmailVerificationService(
                        new BullBatchJobs(queue as never, admissions),
                        resultReader,
                        admissions,
                    ),
                },
            ],
        }).compile()
        app = module.createNestApplication({ logger: false })
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
        jest.resetAllMocks()
        principal = principalFixture
        queue.getJob.mockResolvedValue(rawJob('active'))
        admissions.findById.mockResolvedValue({
            batchId: jobId,
            organizationId,
            state: 'admitted',
            totalRows: 10,
            uniqueAddressCount: 10,
            clientRequestKey: null,
            contentDigest: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        admissions.countUnsettledAddresses.mockResolvedValue(2)
        admissions.getStatusCounts.mockResolvedValue({
            cachedAddresses: 0,
            sharedAddresses: 0,
            cooldownAddresses: 0,
            completedAddresses: 8,
            conclusiveAddresses: 8,
            inconclusiveAddresses: 0,
            failedAddresses: 0,
            reserved: 8,
            charged: 8,
        })
    })

    const expectedCounts = {
        totalRows: 10,
        uniqueAddresses: 10,
        duplicateRows: 0,
        cachedAddresses: 0,
        sharedAddresses: 0,
        cooldownAddresses: 0,
        completedAddresses: 8,
        conclusiveAddresses: 8,
        inconclusiveAddresses: 0,
        failedAddresses: 0,
    }
    const expectedBilling = { state: 'pending', reserved: 8, charged: 8 }

    afterAll(async () => {
        await app.close()
    })

    it.each(['', '/results'])('requires authentication and read permission for GET %s', async suffix => {
        principal = undefined
        await request(app.getHttpServer()).get(`/verifyBatch/${jobId}${suffix}`).expect(401)
        principal = { ...principalFixture, permissions: ['verification:run'] }
        await request(app.getHttpServer()).get(`/verifyBatch/${jobId}${suffix}`).expect(403)
        expect(queue.getJob).not.toHaveBeenCalled()
        expect(resultReader.read).not.toHaveBeenCalled()
    })

    it.each(['', '/results'])(
        'rejects an invalid UUID before lookup or filename construction for GET %s',
        async suffix => {
            await request(app.getHttpServer()).get(`/verifyBatch/not-a-uuid${suffix}`).expect(400)
            expect(queue.getJob).not.toHaveBeenCalled()
        },
    )

    it.each(['', '/results'])('conceals foreign work exactly like missing work for GET %s', async suffix => {
        queue.getJob.mockResolvedValueOnce(undefined)
        const missing = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}${suffix}`).expect(404)
        const foreign = rawJob('completed', { data: { organizationId: 'foreign-organization' } })
        queue.getJob.mockResolvedValueOnce(foreign)
        const other = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}${suffix}`).expect(404)
        expect(other.body).toEqual(missing.body)
        expect(foreign.getState).not.toHaveBeenCalled()
        expect(resultReader.read).not.toHaveBeenCalled()
    })

    it.each([
        ['waiting', 'queued'],
        ['waiting-children', 'queued'],
        ['active', 'running'],
        ['unknown', 'unavailable'],
        ['future-private-state', 'unavailable'],
        ['completed', 'unavailable'],
    ])('serializes %s as only safe %s state and exact bounded counts', async (rawState, status) => {
        queue.getJob.mockResolvedValue(rawJob(rawState))
        const response = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}`).expect(200)
        expect(response.body).toEqual({
            id: jobId,
            status,
            total: 10,
            processed: 8,
            unprocessed: 2,
            progress: 80,
            resultsAvailable: false,
            counts: expectedCounts,
            billing: expectedBilling,
        })
        expect(queue.add).not.toHaveBeenCalled()
    })

    it.each(['invalid_csv', 'insufficient_credits', 'processing_failed', undefined, 'private parser message'])(
        'serializes only an allowlisted failure code %#',
        async marker => {
            queue.getJob.mockResolvedValue(
                rawJob('failed', { data: { organizationId, step: BatchJobStep.Validate, failureCode: marker } }),
            )
            const response = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}`).expect(200)
            expect(response.body).toEqual({
                id: jobId,
                status: 'failed',
                total: 10,
                processed: 8,
                unprocessed: 2,
                progress: 0,
                resultsAvailable: true,
                counts: expectedCounts,
                billing: expectedBilling,
                failureCode:
                    marker === 'invalid_csv' || marker === 'insufficient_credits' ? marker : 'processing_failed',
            })
            expect(response.text).not.toMatch(/private|stacktrace|failedReason|storage|parser/)
        },
    )

    it('exposes completion after a successful retry without the old failure marker', async () => {
        queue.getJob.mockResolvedValue(
            rawJob('completed', {
                data: { organizationId, step: BatchJobStep.Finish, failureCode: 'processing_failed' },
                returnvalue: 's3://bucket/results/file.csv',
            }),
        )
        const response = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}`).expect(200)
        expect(response.body).toEqual({
            id: jobId,
            status: 'completed',
            total: 10,
            processed: 8,
            unprocessed: 2,
            progress: 100,
            resultsAvailable: true,
            counts: expectedCounts,
            billing: expectedBilling,
        })
    })

    it('downloads exact streamed CSV bytes with a UUID-only filename on repeatable GETs', async () => {
        const csv = 'email\n"\'=SUM(1,2)"\n\'+person@lef.test\n'
        queue.getJob.mockResolvedValue(rawJob('completed', { returnvalue: 's3://bucket/results/file.csv' }))
        resultReader.read.mockImplementation(() => Promise.resolve(Readable.from([csv.slice(0, 12), csv.slice(12)])))
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await request(app.getHttpServer()).get(`/verifyBatch/${jobId}/results`).expect(200)
            expect(response.headers['content-type']).toBe('text/csv')
            expect(response.headers['content-disposition']).toBe(
                `attachment; filename="batch-verification-${jobId}.csv"`,
            )
            expect(Buffer.from(response.text)).toEqual(Buffer.from(csv))
        }
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('returns a concealed 404 when the retained result has disappeared after completion', async () => {
        queue.getJob.mockResolvedValue(rawJob('completed', { returnvalue: 's3://bucket/results/file.csv' }))
        resultReader.read.mockRejectedValue(new BatchResultUnavailableError())
        await request(app.getHttpServer()).get(`/verifyBatch/${jobId}/results`).expect(404)
        expect(queue.add).not.toHaveBeenCalled()
    })
})
