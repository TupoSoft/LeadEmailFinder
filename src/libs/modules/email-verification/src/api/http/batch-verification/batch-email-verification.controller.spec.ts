import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { HttpStatus, INestApplication, NestMiddleware, ParseFilePipe } from '@nestjs/common'
import { MiddlewareConsumer, Module } from '@nestjs/common'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { NextFunction, Request, Response } from 'express'
import { Readable } from 'node:stream'
import { GetBatchStatusResponseDto } from './batch-email-verification.dto'
import {
    BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
    BatchEmailVerificationService,
} from '../../../application/delivery/batch/batch-email-verification.service'
import { BatchEmailVerificationJobNotFoundException } from '../../../application/delivery/batch/job-not-found.exception'

const requestId = '11584325-be4b-4219-8a2c-06ba72b710d0'
const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal

class FixturePrincipalMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        req.id = requestId
        setAuthPrincipal(req, principal)
        next()
    }
}

@Module({
    controllers: [BatchEmailVerificationController],
    providers: [
        {
            provide: BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN,
            useValue: {
                uploadFile: jest.fn(),
                getBatchStatus: jest.fn(),
                getBatchResults: jest.fn(),
            },
        },
    ],
})
class TestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(FixturePrincipalMiddleware).forRoutes('*')
    }
}

describe('BatchEmailVerificationController', () => {
    let app: INestApplication
    let batchEmailVerificationService: jest.Mocked<BatchEmailVerificationService>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [TestModule],
        })
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        batchEmailVerificationService = module.get(BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN)
        app = module.createNestApplication()

        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    it('requires verification:run to upload and verification:read to check status/results', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, BatchEmailVerificationController)).toEqual([PermissionsGuard])
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSIONS_METADATA_KEY,
                BatchEmailVerificationController.prototype.uploadFile,
            ),
        ).toEqual(['verification:run'])
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSIONS_METADATA_KEY,
                BatchEmailVerificationController.prototype.getBatchStatus,
            ),
        ).toEqual(['verification:read'])
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSIONS_METADATA_KEY,
                BatchEmailVerificationController.prototype.getBatchResults,
            ),
        ).toEqual(['verification:read'])
    })

    describe('POST /verifyBatch/csv', () => {
        it('accepts exactly 100 megabytes and rejects the next byte through the configured upload pipe', async () => {
            const metadata = Reflect.getMetadata(
                ROUTE_ARGS_METADATA,
                BatchEmailVerificationController,
                'uploadFile',
            ) as Record<string, { pipes: unknown[] }>
            const pipe = Object.values(metadata)
                .flatMap(argument => argument.pipes)
                .find(value => value instanceof ParseFilePipe) as ParseFilePipe
            expect(pipe).toBeDefined()
            const file = { size: 104857600, mimetype: 'text/csv' }
            await expect(pipe.transform(file)).resolves.toBe(file)
            await expect(pipe.transform({ ...file, size: 104857601 })).rejects.toThrow('at most 104857600 bytes')
        })

        it('should return 202 if a valid CSV file is uploaded', async () => {
            const csvContent = 'email\nuser1@example.com\nuser2@example.com'
            const fileBuffer = Buffer.from(csvContent)

            const id = randomUUID()
            batchEmailVerificationService.uploadFile.mockResolvedValueOnce({ id })

            await request(app.getHttpServer())
                .post('/verifyBatch/csv')
                .attach('file', fileBuffer, {
                    filename: 'test.csv',
                    contentType: 'text/csv',
                })
                .expect(HttpStatus.ACCEPTED, { id })

            expect(batchEmailVerificationService.uploadFile).toHaveBeenCalledWith(
                expect.objectContaining({ organizationId: 'org-1', credentialId: 'cred-1' }),
                requestId,
            )
        })

        it('should return 422 if an invalid file type is uploaded', async () => {
            const invalidFileContent = '<html lang="en"></html>'
            const fileBuffer = Buffer.from(invalidFileContent)

            const response = await request(app.getHttpServer()).post('/verifyBatch/csv').attach('file', fileBuffer, {
                filename: 'test.html',
                contentType: 'text/html',
            })

            expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
        })

        it('should return 422 if the file size exceeds the limit', async () => {
            const largeFileBuffer = Buffer.alloc(104857601) // 2 MB

            const response = await request(app.getHttpServer())
                .post('/verifyBatch/csv')
                .attach('file', largeFileBuffer, {
                    filename: 'large.csv',
                    contentType: 'text/csv',
                })

            expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
        }, 10000)
    })

    describe('GET /verifyBatch/:id', () => {
        it('serializes a finite, bounded progress value', async () => {
            const id = randomUUID()
            batchEmailVerificationService.getBatchStatus.mockResolvedValueOnce({
                id,
                status: 'running',
                total: 10,
                processed: 8,
                unprocessed: 2,
                progress: 80,
                resultsAvailable: false,
                counts: {
                    totalRows: 10,
                    uniqueAddresses: 8,
                    duplicateRows: 2,
                    cachedAddresses: 0,
                    sharedAddresses: 0,
                    cooldownAddresses: 0,
                    completedAddresses: 8,
                    conclusiveAddresses: 8,
                    inconclusiveAddresses: 0,
                    failedAddresses: 0,
                },
                billing: { state: 'pending', reserved: 8, charged: 8 },
            })

            const response = await request(app.getHttpServer()).get(`/verifyBatch/${id}`)
            const body = response.body as GetBatchStatusResponseDto

            expect(response.status).toBe(HttpStatus.OK)
            expect(body.progress).toBe(80)
            expect(Number.isFinite(body.progress)).toBe(true)
        })
    })

    describe('GET /verifyBatch/:id/results', () => {
        it('streams the CSV body with a text/csv content type for a completed job', async () => {
            const id = randomUUID()
            const csvContent = 'email\nperson@lef.test\n'
            batchEmailVerificationService.getBatchResults.mockResolvedValueOnce(Readable.from([csvContent]))

            const response = await request(app.getHttpServer()).get(`/verifyBatch/${id}/results`)

            expect(response.status).toBe(HttpStatus.OK)
            expect(response.headers['content-type']).toContain('text/csv')
            expect(response.text).toBe(csvContent)
        })

        it('returns 404 when the service reports the job as not found or not owned', async () => {
            const id = randomUUID()
            batchEmailVerificationService.getBatchResults.mockRejectedValueOnce(
                new BatchEmailVerificationJobNotFoundException(id),
            )

            const response = await request(app.getHttpServer()).get(`/verifyBatch/${id}/results`)

            expect(response.status).toBe(HttpStatus.NOT_FOUND)
        })
    })
})
