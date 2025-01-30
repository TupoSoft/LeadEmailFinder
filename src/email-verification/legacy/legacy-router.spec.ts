import { describe, it, jest } from '@jest/globals'
import express, { Router } from 'express'
import request from 'supertest'
import { constants } from 'node:http2'
import { ErrorMiddleware } from '../../middleware/handle-error'
import { LegacyEmailVerificationController } from './legacy-controller'
import type { IEmailVerificationService } from '../service'
import type { EmailVerificationResult } from '../dto'
import type { IAuthMiddleware } from '../../middleware'
import { LegacyEmailVerificationRouter } from './legacy-router'
import { VERIFY_EMAIL_ROUTE_LEGACY } from './constants'
import Mocked = jest.Mocked

describe(VERIFY_EMAIL_ROUTE_LEGACY, () => {
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

    const legacyEmailVerificationController = new LegacyEmailVerificationController(emailVerificationService)
    const legacyEmailVerificationRouter = new LegacyEmailVerificationRouter(
        expressRouter,
        authMiddleware,
        legacyEmailVerificationController,
    )
    legacyEmailVerificationRouter.init()

    app.use(express.json())
    app.use(expressRouter)
    app.use(errorMiddleware.handleError.bind(errorMiddleware))

    const email = 'danilo@microsoft.com'
    const [localPart, domain] = email.split('@')

    const verificationResult: EmailVerificationResult = {
        domain,
        exists: false,
        localPart,
        sources: ['SMTP'],
        email,
    }

    it('should return HTTP_OK', async () => {
        emailVerificationService.verify.mockResolvedValueOnce(verificationResult)

        await request(app)
            .get(VERIFY_EMAIL_ROUTE_LEGACY)
            .query({ email })
            .expect('Content-Type', /json/)
            .expect(constants.HTTP_STATUS_OK)
    })

    it('should return HTTP_BAD_REQUEST', async () => {
        await request(app)
            .get(VERIFY_EMAIL_ROUTE_LEGACY)
            .expect('Content-Type', /json/)
            .expect(constants.HTTP_STATUS_BAD_REQUEST)
    })
})
