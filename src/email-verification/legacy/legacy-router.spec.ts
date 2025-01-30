import { describe, expect, it, jest } from '@jest/globals'
import { VERIFY_EMAIL_ROUTE_LEGACY } from '../constants'
import express from 'express'
import type { IEmailVerificationService } from '../service'
import type { IAuthMiddleware } from '../../middleware'
import { ErrorMiddleware } from '../../middleware/handle-error'
import { LegacyEmailVerificationController } from './legacy-controller'
import { LegacyEmailVerificationRouter } from './legacy-router'
import type { EmailVerificationResult } from '../dto'
import request from 'supertest'
import { constants } from 'node:http2'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { LegacyEmailVerificationResult } from './dto'
import Mocked = jest.Mocked

const verifiedAt = new Date('2022-01-01T00:00:00.000Z')
jest.useFakeTimers().setSystemTime(verifiedAt)

describe(VERIFY_EMAIL_ROUTE_LEGACY, () => {
    const app = express()
    const router = express.Router()

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
        router,
        authMiddleware,
        legacyEmailVerificationController,
    )
    legacyEmailVerificationRouter.init()

    app.use(express.json())
    app.use(router)
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

    const legacyVerificationResult: LegacyEmailVerificationResult = {
        catchAll: CatchAllStatus.Disabled,
        deliveryStatus: DeliveryStatus.Rejected,
        verifiedAt,
        email,
        localPart,
        domain,
    }

    it('should return HTTP_OK', async () => {
        emailVerificationService.verify.mockResolvedValueOnce(verificationResult)

        await request(app)
            .get(VERIFY_EMAIL_ROUTE_LEGACY)
            .query({ email })
            .expect('Content-Type', /json/)
            .expect(response => {
                expect(response.body).toEqual(legacyVerificationResult)
            })
            .expect(constants.HTTP_STATUS_OK)
    })
})
