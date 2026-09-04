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
import { VerificationTraceObserver } from '../application/verification-trace/verification-trace-observer'

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
    let observer: jest.Mocked<VerificationTraceObserver>

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
        observer = { enqueued: jest.fn(), completed: jest.fn(), failed: jest.fn(), batchCompleted: jest.fn() }
        service = new EmailVerificationService(
            emailVerifier,
            emailVerificationRepo as unknown as Repository<EmailVerification>,
            emailService,
            domainService,
            observer,
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

describe('verification trace stages and isolation', () => {
    const trace = {
        operationId: '30000000-0000-4000-8000-000000000001',
        mode: 'batch_child' as const,
        jobId: '30000000-0000-4000-8000-000000000001',
        batchId: '40000000-0000-4000-8000-000000000001',
        attempt: 2,
    }

    function fixture(): {
        observer: jest.Mocked<VerificationTraceObserver>
        domainService: { isVerificationAllowed: jest.Mock }
        emailService: { upsertEmail: jest.Mock }
        verifier: { verify: jest.Mock }
        repo: { create: jest.Mock; save: jest.Mock }
        service: EmailVerificationService
    } {
        const observer = { enqueued: jest.fn(), completed: jest.fn(), failed: jest.fn(), batchCompleted: jest.fn() }
        const domainService = { isVerificationAllowed: jest.fn().mockResolvedValue(true) }
        const emailService = { upsertEmail: jest.fn().mockResolvedValue(undefined) }
        const verifier = { verify: jest.fn().mockResolvedValue(verificationResult) }
        const repo = {
            create: jest.fn().mockReturnValue({ organizationId }),
            save: jest.fn().mockResolvedValue(verificationEntity()),
        }
        const service = new EmailVerificationService(
            verifier,
            repo as unknown as Repository<EmailVerification>,
            emailService as unknown as IEmailService,
            domainService as unknown as IDomainService,
            observer,
        )
        return { observer, domainService, emailService, verifier, repo, service }
    }

    it.each(Object.values(EmailVerificationReason))(
        'completes expected %s classifications using only result IDs and codes',
        async reason => {
            const { observer, repo, service } = fixture()
            repo.save.mockResolvedValue(verificationEntity({ reason }))
            await service.verify({ organizationId, email, trace })
            expect(observer.completed).toHaveBeenCalledWith({
                ...trace,
                verificationId,
                reason,
                durationMs: expect.any(Number),
            })
            expect(observer.failed).not.toHaveBeenCalled()
            expect(JSON.stringify(observer.completed.mock.calls)).not.toContain(email)
            expect(repo.save).toHaveBeenCalledWith(expect.not.objectContaining({ trace: expect.anything() }))
        },
    )

    it.each([
        'domain_policy',
        'email_cache_prepare',
        'verification_probe',
        'verification_persist',
        'email_cache_finalize',
    ])('reports %s and preserves the original error even when the observer throws', async stage => {
        const { observer, domainService, emailService, verifier, repo, service } = fixture()
        const error = new Error('private SMTP response for ' + email)
        if (stage === 'domain_policy') domainService.isVerificationAllowed.mockRejectedValue(error)
        if (stage === 'email_cache_prepare') emailService.upsertEmail.mockRejectedValueOnce(error)
        if (stage === 'verification_probe') verifier.verify.mockRejectedValue(error)
        if (stage === 'verification_persist') repo.save.mockRejectedValue(error)
        if (stage === 'email_cache_finalize')
            emailService.upsertEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error)
        observer.failed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })
        await expect(service.verify({ organizationId, email, trace })).rejects.toBe(error)
        expect(observer.failed).toHaveBeenCalledWith({
            ...trace,
            stage,
            errorType: 'Error',
            durationMs: expect.any(Number),
        })
        expect(observer.completed).not.toHaveBeenCalled()
        expect(JSON.stringify(observer.failed.mock.calls)).not.toContain(email)
    })

    it('preserves result persistence and cache finalization when completion logging fails', async () => {
        const { observer, emailService, repo, service } = fixture()
        observer.completed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })
        await expect(service.verify({ organizationId, email, trace })).resolves.toMatchObject({
            id: verificationId,
            email,
        })
        expect(repo.save).toHaveBeenCalledTimes(1)
        expect(emailService.upsertEmail).toHaveBeenCalledTimes(2)
        expect(observer.failed).not.toHaveBeenCalled()
    })
})
