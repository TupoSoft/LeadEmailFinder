import {
    EmailVerificationReason,
    EmailVerificationSource,
    ICatchAllVerifier,
    ISmtpVerifier,
    VerifyOptions,
} from '@tuposoft/lead-email-finder/common'
import { EmailVerifier } from './email-verifier.service'
import { Test } from '@nestjs/testing'
import { getSecondLevelDomain } from '@tuposoft/lead-email-finder/dns'

jest.mock('@tuposoft/lead-email-finder/dns', () => ({
    getSecondLevelDomain: jest.fn(),
}))

const email = 'danilo@microsoft.com'
const [, domain] = email.split('@')
const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const SMTP_VERIFIER_TOKEN = 'SmtpVerifierToken'
const CATCH_ALL_VERIFIERS_TOKEN = 'CatchAllVerifiersToken'

const verificationOptions = (): VerifyOptions => ({ organizationId, email })

describe('EmailVerifier', () => {
    let emailVerifier: EmailVerifier
    let smtpVerifierMock: jest.Mocked<ISmtpVerifier>
    let catchAllVerifiersMock: Array<jest.Mocked<ICatchAllVerifier>>
    const getSecondLevelDomainMock = getSecondLevelDomain as jest.MockedFn<typeof getSecondLevelDomain>

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
        const request = verificationOptions()

        smtpVerifierMock.verify.mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'domain.com',
            reason: EmailVerificationReason.AcceptedEmail,
        })

        const result = await emailVerifier.verify(request)

        expect(smtpVerifierMock.verify).toHaveBeenCalledWith(
            organizationId,
            `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`,
        )
        expect(result.catchAll).toBe(true)
        expect(result.email).toBe(request.email)
        expect(result.domain).toBe(domain)
    })

    it('should verify email itself when domain is not a catch-all', async () => {
        const request = verificationOptions()
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

        const result = await emailVerifier.verify(request)

        expect(smtpVerifierMock.verify).toHaveBeenNthCalledWith(
            1,
            organizationId,
            `tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@${domain}`,
        )
        expect(smtpVerifierMock.verify).toHaveBeenNthCalledWith(2, organizationId, email)
        expect(result.exists).toBe(true)
        expect(result.sources).toContain(EmailVerificationSource.MX)
        expect(result.reason).toBe(EmailVerificationReason.AcceptedEmail)
    })

    it('should verify via HTTP if necessary', async () => {
        const request = verificationOptions()

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'domain.com',
            reason: EmailVerificationReason.Blacklisted,
        })

        const [microsoft1, microsoft2] = catchAllVerifiersMock

        microsoft1.verify.mockResolvedValue(true)
        microsoft2.verify.mockResolvedValue(false)

        const result = await emailVerifier.verify(request)

        expect(result.sources).toContain(microsoft1.sourceName)
        expect(result.exists).toBe(true)
        expect(result.reason).toBe(EmailVerificationReason.Webmail)
    })

    it('should return unknown reason when verification fails', async () => {
        const request = verificationOptions()

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValue({
            email,
            exists: null,
            reason: EmailVerificationReason.Unknown,
        })

        const result = await emailVerifier.verify(request)

        expect(result.exists).toBe(null)
        expect(result.reason).toBe(EmailVerificationReason.Unknown)
    })

    it('rejects an unknown SMTP reason without copying the address or reason into the assertion', async () => {
        const sentinel = 'unique-person@private.example'
        smtpVerifierMock.verify.mockResolvedValueOnce({
            email: sentinel,
            exists: null,
            reason: sentinel as never,
        })

        const error = await emailVerifier
            .verify({ organizationId, email: sentinel })
            .catch((caughtError: unknown) => caughtError)

        expect(error).toMatchObject({
            name: 'AssertionError',
            message: 'email_verification_reason_unknown',
        })
        expect((error as { message: string }).message).not.toContain(sentinel)
    })

    it('should extract correct MX domain from target exchange', async () => {
        const request = verificationOptions()

        jest.spyOn(smtpVerifierMock, 'verify').mockResolvedValueOnce({
            email,
            exists: true,
            targetExchange: 'smtp.some.domain.com',
            reason: EmailVerificationReason.AcceptedEmail,
        })

        getSecondLevelDomainMock.mockReturnValueOnce('domain.com')

        const result = await emailVerifier.verify(request)

        expect(result.mxDomain).toBe('domain.com')
    })
})
