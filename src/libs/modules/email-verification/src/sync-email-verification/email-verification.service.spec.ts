import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IDomainService,
    IEmailService,
    IEmailVerificationResultDto,
    IEmailVerifier,
} from '@tuposoft/lead-email-finder/common'
import { Repository } from 'typeorm'
import { DomainVerificationForbiddenException } from './domain-verification-forbidden.exception'
import { DOMAIN_SERVICE_TOKEN, EMAIL_SERVICE_TOKEN, EMAIL_VERIFIER_TOKEN } from './email-verification.constants'
import { EmailVerification } from './email-verification.entity'
import { EmailVerificationService } from './email-verification.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const email = 'person@example.test'
const verificationId = '20000000-0000-4000-8000-000000000001'
const date = new Date('2026-08-31T00:00:00.000Z')

const verificationResult: IEmailVerificationResultDto = {
    email,
    domain: 'example.test',
    localPart: 'person',
    format: EmailPatternEnum.First,
    exists: true,
    catchAll: false,
    reason: EmailVerificationReason.AcceptedEmail,
    sources: [EmailVerificationSource.MX],
}

function verificationEntity(overrides: Partial<EmailVerification> = {}): EmailVerification {
    return {
        id: verificationId,
        organizationId,
        ...verificationResult,
        createdAt: date,
        ...overrides,
    }
}

describe('EmailVerificationService', () => {
    let emailVerifier: jest.Mocked<IEmailVerifier>
    let emailVerificationRepo: jest.Mocked<Pick<Repository<EmailVerification>, 'create' | 'save'>>
    let emailService: jest.Mocked<IEmailService>
    let domainService: jest.Mocked<IDomainService>
    let service: EmailVerificationService

    beforeEach(() => {
        emailVerifier = { verify: jest.fn() }
        emailVerificationRepo = {
            create: jest.fn(),
            save: jest.fn(),
        }
        emailService = {
            createEmail: jest.fn(),
            getEmails: jest.fn(),
            getEmail: jest.fn(),
            updateEmail: jest.fn(),
            upsertEmail: jest.fn(),
        }
        domainService = { getDomain: jest.fn(), isVerificationAllowed: jest.fn() }
        service = new EmailVerificationService(
            emailVerifier,
            emailVerificationRepo as unknown as Repository<EmailVerification>,
            emailService,
            domainService,
        )
    })

    it('uses the organization throughout verification and appends an immutable result', async () => {
        const priorVerificationId = '20000000-0000-4000-8000-000000000002'
        const newVerification = { organizationId } as EmailVerification
        const emailRecord = {
            email,
            username: 'person',
            domain: 'example.test',
            exists: null,
            format: EmailPatternEnum.First,
            lastVerificationId: priorVerificationId,
            createdAt: date,
            updatedAt: date,
        }
        domainService.isVerificationAllowed.mockResolvedValue(true)
        emailService.upsertEmail.mockResolvedValue(emailRecord)
        emailVerifier.verify.mockResolvedValue(verificationResult)
        emailVerificationRepo.create.mockReturnValue(newVerification)
        emailVerificationRepo.save.mockResolvedValue(verificationEntity({ batchId: 'batch-1' }))

        const result = await service.verify({
            organizationId,
            email: 'Person@Example.Test',
            format: EmailPatternEnum.First,
            batchId: 'batch-1',
        })

        expect(domainService.isVerificationAllowed).toHaveBeenCalledWith('example.test')
        expect(emailService.upsertEmail).toHaveBeenNthCalledWith(1, organizationId, email, {
            format: EmailPatternEnum.First,
            exists: null,
        })
        expect(emailVerifier.verify).toHaveBeenCalledWith({
            organizationId,
            email,
            format: EmailPatternEnum.First,
        })
        expect(emailVerificationRepo.create).toHaveBeenCalledWith({ organizationId })
        expect(emailVerificationRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId, email, batchId: 'batch-1', exists: true }),
        )
        expect(emailService.upsertEmail).toHaveBeenNthCalledWith(2, organizationId, email, {
            exists: true,
            lastVerificationId: verificationId,
        })
        expect(result).toEqual(expect.objectContaining({ id: verificationId, email, batchId: 'batch-1' }))
        expect(result).not.toHaveProperty('organizationId')
    })

    it('creates a new owned result when the email has no prior verification', async () => {
        const ownedVerification = verificationEntity()
        const newVerification = { organizationId } as EmailVerification
        domainService.isVerificationAllowed.mockResolvedValue(true)
        emailService.upsertEmail.mockResolvedValue({
            email,
            username: 'person',
            domain: 'example.test',
            exists: null,
            lastVerificationId: verificationId,
            createdAt: date,
            updatedAt: date,
        })
        emailVerifier.verify.mockResolvedValue(verificationResult)
        emailVerificationRepo.create.mockReturnValue(newVerification)
        emailVerificationRepo.save.mockResolvedValue(ownedVerification)

        const result = await service.verify({ organizationId, email })

        expect(emailVerificationRepo.create).toHaveBeenCalledWith({ organizationId })
        expect(emailVerificationRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId, email, exists: true }),
        )
        expect(result).not.toHaveProperty('organizationId')
    })

    it('rejects a forbidden shared domain before reading or writing tenant state', async () => {
        domainService.isVerificationAllowed.mockResolvedValue(false)

        const error = await service.verify({ organizationId, email }).catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(DomainVerificationForbiddenException)
        expect((error as Error).message).toBe('Email verification is forbidden for this domain.')
        expect((error as Error).message).not.toContain('example.test')
        expect(domainService.isVerificationAllowed).toHaveBeenCalledWith('example.test')
        expect(emailService.upsertEmail).not.toHaveBeenCalled()
        expect(emailVerifier.verify).not.toHaveBeenCalled()
        expect(emailVerificationRepo.save).not.toHaveBeenCalled()
    })

    it('keeps its dependency tokens explicit for focused wiring', () => {
        expect(EMAIL_VERIFIER_TOKEN).toBe('EmailVerifierToken')
        expect(EMAIL_SERVICE_TOKEN).toBe('EmailServiceToken')
        expect(DOMAIN_SERVICE_TOKEN).toBe('DomainServiceToken')
    })
})
