import { describe, it, jest } from '@jest/globals'
import {
    EMAIL_ROUTE,
    VERIFY_EMAIL_BULK_RESULT_ROUTE,
    VERIFY_EMAIL_BULK_ROUTE,
    VERIFY_EMAIL_BULK_STATUS_ROUTE,
    VERIFY_EMAIL_ROUTE,
} from './constants'
import express, { Router } from 'express'
import type { IEmailVerificationService } from './service'
import { ExpressEmailVerificationController } from './controller'
import { EmailVerificationRouter } from './router'
import type { IAuthMiddleware } from '../middleware'
import type { EmailVerificationResult, VerifyEmailBulkResponse } from './dto'
import request from 'supertest'
import { constants } from 'node:http2'
import { JobNotFoundError } from './errors'
import { ErrorMiddleware } from '../middleware/handle-error'
import Mocked = jest.Mocked

describe(EMAIL_ROUTE, () => {
    const app = express()
    const expressRouter = Router()

    const emailVerificationService: Mocked<IEmailVerificationService> = {
        getVerifyBulkResult: jest.fn(),
        getVerifyBulkStatus: jest.fn(),
        verify: jest.fn(),
        verifyBulk: jest.fn(),
    }
    const authMiddleware: Mocked<IAuthMiddleware> = {
        authenticate: jest.fn((_req, _res, next) => {
            next()
        }),
    }
    const errorMiddleware = new ErrorMiddleware(console)

    const emailVerificationController = new ExpressEmailVerificationController(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(
        expressRouter,
        emailVerificationController,
        authMiddleware,
    )
    emailVerificationRouter.init()

    app.use(express.json())
    app.use(expressRouter)
    app.use(errorMiddleware.handleError.bind(errorMiddleware))

    const email = 'danilo@microsoft.com'
    const [localPart, domain] = email.split('@')

    const verificationResult: EmailVerificationResult = {
        domain,
        exists: false,
        localPart,
        sources: ['mx'],
        email,
    }

    describe(VERIFY_EMAIL_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            emailVerificationService.verify.mockResolvedValueOnce(verificationResult)

            await request(app)
                .post(VERIFY_EMAIL_ROUTE)
                .send({ email })
                .expect('Content-Type', /json/)
                .expect(verificationResult)
                .expect(constants.HTTP_STATUS_OK)
        })

        it('should return HTTP_BAD_REQUEST', async () => {
            await request(app)
                .post(VERIFY_EMAIL_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_BAD_REQUEST)
        })
    })

    describe(VERIFY_EMAIL_BULK_ROUTE, () => {
        const emails = ['danilo@microsoft.com', 'danilo@facebook.com', 'danilo@gmail.com']

        it('should return HTTP_ACCEPTED', async () => {
            const result: VerifyEmailBulkResponse = {
                taskId: '1',
                message: 'Request accepted. Starting to find emails.',
                monitorUrl: 'http://localhost:3000/emails/verify/bulk/1/status',
            }

            emailVerificationService.verifyBulk.mockResolvedValueOnce(result)

            await request(app)
                .post(VERIFY_EMAIL_BULK_ROUTE)
                .send({ emails })
                .expect(result)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_ACCEPTED)
        })

        it('should return HTTP_BAD_REQUEST', async () => {
            await request(app)
                .post(VERIFY_EMAIL_BULK_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_BAD_REQUEST)
        })
    })

    describe(VERIFY_EMAIL_BULK_STATUS_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            emailVerificationService.getVerifyBulkStatus.mockResolvedValueOnce({ status: 'completed' })

            await request(app)
                .get(VERIFY_EMAIL_BULK_STATUS_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_OK)
        })

        it('should return HTTP_NOT_FOUND when the job was not found', async () => {
            const jobNotFoundError = new JobNotFoundError('1')
            const { message } = jobNotFoundError
            emailVerificationService.getVerifyBulkStatus.mockRejectedValueOnce(jobNotFoundError)

            await request(app)
                .get(VERIFY_EMAIL_BULK_STATUS_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_NOT_FOUND)
                .expect({ message })
        })
    })

    describe(VERIFY_EMAIL_BULK_RESULT_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            const verificationResults = [verificationResult]
            emailVerificationService.getVerifyBulkResult.mockResolvedValueOnce(verificationResults)

            await request(app)
                .get(VERIFY_EMAIL_BULK_RESULT_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_OK)
                .expect(verificationResults)
        })

        it('should return HTTP_NOT_FOUND when the job was not found', async () => {
            const jobNotFoundError = new JobNotFoundError('1')
            const { message } = jobNotFoundError
            emailVerificationService.getVerifyBulkResult.mockRejectedValueOnce(jobNotFoundError)

            await request(app)
                .get(VERIFY_EMAIL_BULK_RESULT_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_NOT_FOUND)
                .expect({ message })
        })
    })
})
