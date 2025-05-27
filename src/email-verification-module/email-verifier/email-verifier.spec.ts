import { EmailVerificationReason, EmailVerificationSource, ICatchAllVerifier, ISmtpVerifier } from '../../common'
import { EmailVerifier } from './email-verifier.service'
import { Test } from '@nestjs/testing'
import { EmailVerificationRequestDto } from '../sync-email-verification/email-verification-request.dto'

const email = 'danilo@microsoft.com'
const [, domain] = email.split('@')
const SMTP_VERIFIER_TOKEN = 'SmtpVerifierToken'
const CATCH_ALL_VERIFIERS_TOKEN = 'CatchAllVerifiersToken'

describe('EmailVerifier', () => {
    let emailVerifier: EmailVerifier
    let smtpVerifierMock: jest.Mocked<ISmtpVerifier>
    let catchAllVerifiersMock: Array<jest.Mocked<ICatchAllVerifier>>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                EmailVerifier,
                {
                    provide: SMTP_VERIFIER_TOKEN,
                    useValue: {
                        verify: jest.fn(),
                    } satisfies ISmtpVerifier,
                },
                {
                    provide: CATCH_ALL_VERIFIERS_TOKEN,
                    useValue: [
                        {
                            sourceName: 'microsoft_1',
                            verify: jest.fn(),
                        },
                        {
                            sourceName: 'microsoft_2',
                            verify: jest.fn(),
                        },
                    ] satisfies ICatchAllVerifier[],
                },
            ],
        }).compile()

        smtpVerifierMock = moduleRef.get(SMTP_VERIFIER_TOKEN)
        catchAllVerifiersMock = moduleRef.get(CATCH_ALL_VERIFIERS_TOKEN)
        emailVerifier = moduleRef.get(EmailVerifier)
    })

    afterEach(() => {
        jest.resetAllMocks()
    })

    it('should return proper result when email domain is a catch-all', async () => {
        const requestDto: EmailVerificationRequestDto = { email }

        smtpVerifierMock.verify.mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'domain.com',
            reason: EmailVerificationReason.AcceptedEmail,
        })

        const result = await emailVerifier.verify(requestDto)

        expect(smtpVerifierMock.verify).toHaveBeenCalledWith(
            `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`,
        )
        expect(result.catchAll).toBe(true)
        expect(result.email).toBe(requestDto.email)
        expect(result.domain).toBe(domain)
    })

    it('should verify email itself when domain is not a catch-all', async () => {
        const requestDto: EmailVerificationRequestDto = { email }
        jest.spyOn(smtpVerifierMock, 'verify')
            .mockResolvedValueOnce({
                email,
                exists: false,
                targetExchange: 'domain.com',
                reason: EmailVerificationReason.NoMxRecords,
            })
            .mockResolvedValueOnce({
                email,
                exists: true,
                targetExchange: 'domain.com',
                reason: EmailVerificationReason.AcceptedEmail,
            })

        const result = await emailVerifier.verify(requestDto)

        expect(smtpVerifierMock.verify).toHaveBeenCalledWith(email)
        expect(result.exists).toBe(true)
        expect(result.sources).toContain(EmailVerificationSource.MX)
        expect(result.reason).toBe(EmailVerificationReason.AcceptedEmail)
    })

    it('should verify via HTTP if necessary', async () => {
        const requestDto: EmailVerificationRequestDto = { email }

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'domain.com',
            reason: EmailVerificationReason.Blacklisted,
        })

        const [microsoft1, microsoft2] = catchAllVerifiersMock

        microsoft1.verify.mockResolvedValue(true)
        microsoft2.verify.mockResolvedValue(false)

        const result = await emailVerifier.verify(requestDto)

        expect(result.sources).toContain(microsoft1.sourceName)
        expect(result.exists).toBe(true)
        expect(result.reason).toBe(EmailVerificationReason.Webmail)
    })

    it('should return unknown reason when verification fails', async () => {
        const requestDto: EmailVerificationRequestDto = { email }

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValue({
            email,
            exists: null,
            reason: EmailVerificationReason.Unknown,
        })

        const result = await emailVerifier.verify(requestDto)

        expect(result.exists).toBe(null)
        expect(result.reason).toBe(EmailVerificationReason.Unknown)
    })

    it('should extract correct MX domain from target exchange', async () => {
        const requestDto: EmailVerificationRequestDto = { email }

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'smtp.some.domain.com',
            reason: EmailVerificationReason.AcceptedEmail,
        })

        const result = await emailVerifier.verify(requestDto)

        expect(result.mxDomain).toBe('domain.com')
    })
})
