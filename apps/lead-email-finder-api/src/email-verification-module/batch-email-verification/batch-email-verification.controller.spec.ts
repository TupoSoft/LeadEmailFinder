import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { HttpStatus, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { BatchEmailVerificationService } from './batch-email-verification-service.interface'
import { randomUUID } from 'node:crypto'
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/key'

const batchEmailVerificationServiceToken = 'BatchEmailVerificationServiceToken'

describe('BatchEmailVerificationController', () => {
    let app: INestApplication
    let batchEmailVerificationService: jest.Mocked<BatchEmailVerificationService>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [BatchEmailVerificationController],
            providers: [
                {
                    provide: batchEmailVerificationServiceToken,
                    useValue: {
                        uploadFile: jest.fn(),
                    },
                },
            ],
        })
            .overrideGuard(ApiKeyGuard)
            .useValue(null)
            .compile()

        batchEmailVerificationService = module.get(batchEmailVerificationServiceToken)
        app = module.createNestApplication()

        await app.init()
    })

    afterAll(async () => {
        await app.close()
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
})
