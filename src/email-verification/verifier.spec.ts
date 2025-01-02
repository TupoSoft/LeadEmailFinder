/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { EmailVerifier } from './verifier'
import { MockEmailVerificationRepository } from './repository'
import { MockCatchAllVerifier } from './catch-all-verifier'
import { MockSMTPVerifier } from '../smtp'
import type { SMTPVerificationResult } from '../smtp/dto'
import type { EmailVerificationResult } from './dto'
import { PinoLogger } from '../logging'
import pino from 'pino'

describe('EmailVerifier', () => {
    const emailVerificationRepositoryMock =
        new MockEmailVerificationRepository() as jest.Mocked<MockEmailVerificationRepository>
    emailVerificationRepositoryMock.save = jest.fn()

    const catchAllVerifierMock = new MockCatchAllVerifier() as jest.Mocked<MockCatchAllVerifier>
    catchAllVerifierMock.tryAll = jest.fn()

    const smtpVerifierMock = new MockSMTPVerifier() as jest.Mocked<MockSMTPVerifier>
    smtpVerifierMock.verify = jest.fn()

    const logger = new PinoLogger(pino())
    const emailVerifier = new EmailVerifier(smtpVerifierMock, catchAllVerifierMock, logger)

    const email = 'john.doe@example.com'
    const [localPart, domain] = email.split('@')
    const targetExchange = 'mail.example.com'
    const mxDomain = 'example.com'
    const exists = true
    const catchAllStatus = false

    const smtpVerificationResult: SMTPVerificationResult = {
        exists,
        catchAllStatus,
        mxDomain,
        targetExchange,
    }

    const expectedEmailVerificationResult: EmailVerificationResult = {
        email,
        domain,
        localPart,
        targetExchange,
        sources: ['SMTP'],
        exists,
        mxDomain,
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should be able to verify email', async () => {
        smtpVerifierMock.verify.mockResolvedValueOnce(smtpVerificationResult)

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedEmailVerificationResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith({ email })
    })

    it('should return a verification result when the SMTP verifier confirms the email does not exist', async () => {
        const smtpEmailDoesNotExist: SMTPVerificationResult = { ...smtpVerificationResult, exists: false }
        smtpVerifierMock.verify.mockResolvedValueOnce(smtpEmailDoesNotExist)

        const expectedResult: EmailVerificationResult = { ...expectedEmailVerificationResult, exists: false }

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith({ email })
    })
})
