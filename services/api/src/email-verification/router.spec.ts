import { afterEach, beforeEach, describe, it, jest } from '@jest/globals'
import {
    EMAIL_ROUTE,
    VERIFY_EMAIL_BULK_RESULT_ROUTE,
    VERIFY_EMAIL_BULK_ROUTE,
    VERIFY_EMAIL_BULK_STATUS_ROUTE,
    VERIFY_EMAIL_ROUTE,
    VERIFY_EMAIL_ROUTE_OLD,
} from './constants'
import express, { Router } from 'express'
import type { IEmailVerificationService } from './service'
import { ExpressEmailVerificationController } from './controller'
import { EmailVerificationRouter } from './router'
import type { IAuthMiddleware } from '../middleware'
import type { EmailVerificationResult } from './dto'
import request from 'supertest'
import { constants } from 'node:http2'
import { JobNotFoundError } from './errors'
import { ErrorMiddleware } from '../middleware/handle-error'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { BulkResponse, HttpError } from '../common'
import { JobStatus } from '../common/enums'
import { IEmailVerificationQueue } from './queue'
import Mocked = jest.Mocked

describe(EMAIL_ROUTE, () => {
    const app = express()
    const expressRouter = Router()

    const emailVerificationService: Mocked<IEmailVerificationService> = {
        verify: jest.fn(),
    }

    const emailVerificationQueue: Mocked<IEmailVerificationQueue> = {
        addJob: jest.fn(),
        getResult: jest.fn(),
        getStatus: jest.fn(),
    }

    const authMiddleware: Mocked<IAuthMiddleware> = {
        authenticate: jest.fn((_req, _res, next) => {
            next()
        }),
    }
    const errorMiddleware = new ErrorMiddleware(console)

    const emailVerificationController = new ExpressEmailVerificationController(
        emailVerificationService,
        emailVerificationQueue,
    )
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
    const systemTime = new Date('2025-01-01')
    const verifiedAt = systemTime.toISOString()

    const verificationResult: EmailVerificationResult = {
        domain,
        exists: false,
        localPart,
        sources: ['mx'],
        email,
        deliveryStatus: DeliveryStatus.Rejected,
        catchAll: CatchAllStatus.Disabled,
        verifiedAt,
    }

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(systemTime)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe(VERIFY_EMAIL_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            emailVerificationService.verify.mockResolvedValueOnce(verificationResult)

            await request(app)
                .post(VERIFY_EMAIL_ROUTE)
                .send({ email })
                .expect('Content-Type', /json/)
                .expect({ ...verificationResult, verifiedAt })
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
            const taskId = '1'
            const result: BulkResponse = {
                taskId,
                message: 'Request accepted. Starting to find emails.',
                monitorUrl: 'http://127.0.0.1/emails/verify/bulk/1/status',
            }

            emailVerificationQueue.addJob.mockResolvedValueOnce(taskId)

            await request(app)
                .post(VERIFY_EMAIL_BULK_ROUTE)
                .send(emails)
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
            emailVerificationQueue.getStatus.mockResolvedValueOnce({
                status: JobStatus.Completed,
                processed: 1,
                total: 1,
            })

            await request(app)
                .get(VERIFY_EMAIL_BULK_STATUS_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_OK)
        })

        it('should return HTTP_NOT_FOUND when the job was not found', async () => {
            const jobNotFoundError = new JobNotFoundError('1')
            const { message } = jobNotFoundError
            emailVerificationQueue.getStatus.mockRejectedValueOnce(jobNotFoundError)

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
            emailVerificationQueue.getResult.mockResolvedValueOnce(verificationResults)

            await request(app)
                .get(VERIFY_EMAIL_BULK_RESULT_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_OK)
                .expect(verificationResults)
        })

        it('should return HTTP_NOT_FOUND when the job was not found', async () => {
            const jobNotFoundError = new JobNotFoundError('1')
            const { message } = jobNotFoundError
            emailVerificationQueue.getResult.mockRejectedValueOnce(jobNotFoundError)

            await request(app)
                .get(VERIFY_EMAIL_BULK_RESULT_ROUTE)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_NOT_FOUND)
                .expect({ message })
        })
    })

    describe(VERIFY_EMAIL_ROUTE_OLD, () => {
        it('should return HTTP_OK', async () => {
            emailVerificationService.verify.mockResolvedValueOnce(verificationResult)

            await request(app)
                .get(VERIFY_EMAIL_ROUTE_OLD)
                .query({ email })
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_OK)
                .expect({
                    email,
                    localPart,
                    domain,
                    sources: ['mx'],
                    exists: false,
                    verifiedAt: systemTime.toISOString(),
                    deliveryStatus: DeliveryStatus.Rejected,
                    catchAll: CatchAllStatus.Disabled,
                })
        })

        it('should return HTTP_STATUS_BAD_REQUEST', async () => {
            jest.useRealTimers()

            await request(app)
                .get(VERIFY_EMAIL_ROUTE_OLD)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_BAD_REQUEST)
        })

        it('should return HTTP_UNAUTHORIZED', async () => {
            jest.useRealTimers()

            authMiddleware.authenticate.mockImplementationOnce((_req, _res, next) => {
                next(HttpError.Unauthorized('Invalid token'))
            })

            await request(app)
                .get(VERIFY_EMAIL_ROUTE_OLD)
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_UNAUTHORIZED)
                .expect({ message: 'Invalid token' })
        })
    })
})
