import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationController } from './batch-email-verification.controller'
import { HttpStatus, INestApplication } from '@nestjs/common'
import request from 'supertest'

describe('BatchEmailVerificationController', () => {
    let app: INestApplication

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [BatchEmailVerificationController],
        }).compile()

        app = module.createNestApplication()

        await app.init()
    })

    afterAll(async () => {
        await app.close()
    })

    describe('POST /verifyBatch/uploadCSV', () => {
        it('should return 202 if a valid CSV file is uploaded', async () => {
            const csvContent = 'email\nuser1@example.com\nuser2@example.com'
            const fileBuffer = Buffer.from(csvContent)

            await request(app.getHttpServer())
                .post('/verifyBatch/uploadCSV')
                .attach('file', fileBuffer, {
                    filename: 'test.csv',
                    contentType: 'text/csv',
                })
                .expect(HttpStatus.ACCEPTED)
        })

        it('should return 422 if an invalid file type is uploaded', async () => {
            const invalidFileContent = '<html lang="en"></html>'
            const fileBuffer = Buffer.from(invalidFileContent)

            const response = await request(app.getHttpServer())
                .post('/verifyBatch/uploadCSV')
                .attach('file', fileBuffer, {
                    filename: 'test.html',
                    contentType: 'text/html',
                })

            expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
        })

        it('should return 422 if the file size exceeds the limit', async () => {
            const largeFileBuffer = Buffer.alloc(2 * 1024 * 1024) // 2 MB

            const response = await request(app.getHttpServer())
                .post('/verifyBatch/uploadCSV')
                .attach('file', largeFileBuffer, {
                    filename: 'large.csv',
                    contentType: 'text/csv',
                })

            expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
        })

        it('should return 422 if the file content fails custom validation', async () => {
            const invalidCsvContent = ''
            const fileBuffer = Buffer.from(invalidCsvContent)

            const response = await request(app.getHttpServer())
                .post('/verifyBatch/uploadCSV')
                .attach('file', fileBuffer, {
                    filename: 'invalid.csv',
                    contentType: 'text/csv',
                })

            expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
        })
    })
})
