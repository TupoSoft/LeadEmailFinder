/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { EmailVerificationRunner } from './verifier'
import { MockSMTPVerifier } from '../smtp'
import type { SMTPVerificationResult } from '../smtp/dto'
import type { EmailVerificationResponse } from './dto'

describe('EmailVerifier', () => {
    const smtpVerifierMock = new MockSMTPVerifier() as jest.Mocked<MockSMTPVerifier>
    smtpVerifierMock.verify = jest.fn()

    const emailVerifier = new EmailVerificationRunner({
        mx: smtpVerifierMock,
    })

    const email = 'john.doe@example.com'
    const [localPart, domain] = email.split('@')
    const targetExchange = 'mail.example.com'
    const mxDomain = 'example.com'
    const success = true
    const catchAllStatus = false
    const checkedAt = new Date('2023-01-01')

    const smtpVerificationResult: SMTPVerificationResult = {
        success,
        catchAll: catchAllStatus,
        mxDomain,
        mxRecord: targetExchange,
    }

    const expectedEmailVerificationResult: EmailVerificationResponse = {
        checkedAt: checkedAt.toISOString(),
        email,
        domain,
        localPart,
        sources: {
            mx: smtpVerificationResult,
        },
        exists: success,
    }

    jest.useFakeTimers().setSystemTime(checkedAt)

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should be able to verify email', async () => {
        smtpVerifierMock.verify.mockResolvedValueOnce(smtpVerificationResult)

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedEmailVerificationResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith(email)
    })

    it('should return a verification result when the SMTP verifier confirms the email does not exist', async () => {
        const smtpEmailDoesNotExist: SMTPVerificationResult = { ...smtpVerificationResult, success: false }
        smtpVerifierMock.verify.mockResolvedValueOnce(smtpEmailDoesNotExist)

        const expectedResult: EmailVerificationResponse = {
            ...expectedEmailVerificationResult,
            sources: { mx: smtpEmailDoesNotExist },
            exists: false,
        }

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith(email)
    })
})
