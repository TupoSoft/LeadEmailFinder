import { describe, it, jest } from '@jest/globals'
import { EMAIL_ROUTE, VERIFY_EMAIL_ROUTE } from './constants'
import express, { Router } from 'express'
import { IEmailVerificationService } from './service'
import { ExpressEmailVerificationController } from './controller'
import { EmailVerificationRouter } from './router'
import { IAuthMiddleware } from '../middleware'
import { EmailVerificationResult } from './dto'
import request from 'supertest'
import { constants } from 'node:http2'
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
    const emailVerificationController = new ExpressEmailVerificationController(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(
        expressRouter,
        emailVerificationController,
        authMiddleware,
    )
    emailVerificationRouter.init()

    app.use(express.json())
    app.use(expressRouter)

    describe(VERIFY_EMAIL_ROUTE, () => {
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
                .post(VERIFY_EMAIL_ROUTE)
                .send({ email })
                .expect('Content-Type', /json/)
                .expect(verificationResult)
                .expect(constants.HTTP_STATUS_OK)
        })
    })
})
