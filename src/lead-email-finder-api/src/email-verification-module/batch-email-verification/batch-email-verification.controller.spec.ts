import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { HttpStatus, INestApplication, NestMiddleware } from '@nestjs/common'
import { MiddlewareConsumer, Module } from '@nestjs/common'
import request from 'supertest'
import { BatchEmailVerificationService } from './batch-email-verification-service.interface'
import { randomUUID } from 'node:crypto'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { NextFunction, Request, Response } from 'express'
import { JobState } from '@tuposoft/lead-email-finder/common'
import { GetBatchStatusResponseDto } from './batch-email-verification.dto'

const batchEmailVerificationServiceToken = 'BatchEmailVerificationServiceToken'
const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal

class FixturePrincipalMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        setAuthPrincipal(req, principal)
        next()
    }
}

@Module({
    controllers: [BatchEmailVerificationController],
    providers: [
        {
            provide: batchEmailVerificationServiceToken,
            useValue: {
                uploadFile: jest.fn(),
                getBatchStatus: jest.fn(),
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

        batchEmailVerificationService = module.get(batchEmailVerificationServiceToken)
        app = module.createNestApplication()

        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    it('requires verification:run to upload and verification:read to check status/results', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, BatchEmailVerificationController)).toEqual([PermissionsGuard])
        expect(
            Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, BatchEmailVerificationController.prototype.uploadFile),
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
                expect.objectContaining({ originalname: 'test.csv' }),
                principal,
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
                status: JobState.ACTIVE,
                total: 10,
                processed: 8,
                unprocessed: 2,
                progress: 80,
            })

            const response = await request(app.getHttpServer()).get(`/verifyBatch/${id}`)
            const body = response.body as GetBatchStatusResponseDto

            expect(response.status).toBe(HttpStatus.OK)
            expect(body.progress).toBe(80)
            expect(Number.isFinite(body.progress)).toBe(true)
        })
    })
})
