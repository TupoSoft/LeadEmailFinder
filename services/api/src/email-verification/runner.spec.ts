import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { EmailVerificationRunner } from './runner'
import type { ISMTPVerifier } from '../smtp'
import type { EmailVerificationResult } from './dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { CatchAllCache } from './catch-all-cache'
import Mocked = jest.Mocked

describe('EmailVerifier', () => {
    const smtpVerifierMock: Mocked<ISMTPVerifier> = {
        verify: jest.fn(),
    }

    const catchAllCache: Mocked<CatchAllCache> = {
        isCatchAllEnabledForDomain: jest.fn(),
        setCatchAllEnabledForDomain: jest.fn(),
    }

    const emailVerifier = new EmailVerificationRunner(smtpVerifierMock, [], catchAllCache)

    const email = 'john.doe@example.com'
    const [localPart, domain] = email.split('@')
    const targetExchange = 'mail.example.com'
    const mxDomain = 'example.com'
    const exists = true

    const expectedEmailVerificationResult: EmailVerificationResult = {
        email,
        domain,
        localPart,
        targetExchange,
        sources: ['mx'],
        exists,
        mxDomain,
        deliveryStatus: DeliveryStatus.Accepted,
        catchAll: CatchAllStatus.Disabled,
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should be able to verify email', async () => {
        smtpVerifierMock.verify.mockResolvedValueOnce({
            exists: false,
            targetExchange,
            email,
            reason: 'rejected_email',
        })
        smtpVerifierMock.verify.mockResolvedValueOnce({ exists: true, targetExchange, email, reason: 'accepted_email' })

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedEmailVerificationResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith({ email })
    })

    it('should return a verification result when the SMTP verifier confirms the email does not exist', async () => {
        smtpVerifierMock.verify.mockResolvedValueOnce({
            exists: false,
            targetExchange,
            email,
            reason: 'rejected_email',
        })
        smtpVerifierMock.verify.mockResolvedValueOnce({
            exists: false,
            targetExchange,
            email,
            reason: 'rejected_email',
        })

        const expectedResult: EmailVerificationResult = {
            ...expectedEmailVerificationResult,
            exists: false,
            deliveryStatus: DeliveryStatus.Rejected,
        }

        const result = await emailVerifier.verify({ email })

        expect(result).toEqual(expectedResult)
        expect(smtpVerifierMock.verify).toHaveBeenCalledWith({ email })
    })
})
