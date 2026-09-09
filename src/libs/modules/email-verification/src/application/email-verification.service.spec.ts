import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { Email } from '../domain/email'
import { EmailVerification, NewEmailVerification } from '../domain/email-verification'
import { DomainVerificationForbiddenError } from '../domain/errors'
import { DomainPolicyService } from './domain-policy.service'
import { EmailAdministrationService } from './email-administration.service'
import { EmailVerificationOrchestrator } from './email-verification.service'
import { MailboxVerificationService } from './mailbox-verification.service'
import { VerificationStore } from './ports/verification-store'
import { VerificationTraceObserver } from './verification-trace/verification-trace-observer'

const organizationId = '10000000-0000-4000-8000-000000000001'
const email = 'person@example.test'
const verificationId = '20000000-0000-4000-8000-000000000001'
const date = new Date('2026-08-31T00:00:00.000Z')

const probeResult: NewEmailVerification = {
    email,
    domain: 'example.test',
    localPart: 'person',
    format: EmailPatternEnum.First,
    exists: true,
    catchAll: false,
    reason: EmailVerificationReason.AcceptedEmail,
    sources: [EmailVerificationSource.MX],
    verificationQuality: 'conclusive_positive',
    evidenceObservedAt: date,
    evidencePolicyVersion: 1,
}

function verificationRecord(overrides: Partial<EmailVerification> = {}): EmailVerification {
    return { id: verificationId, organizationId, ...probeResult, createdAt: date, ...overrides }
}

interface Fixture {
    mailboxVerification: jest.Mocked<Pick<MailboxVerificationService, 'verify'>>
    verificationStore: jest.Mocked<VerificationStore>
    emailAdministration: jest.Mocked<Pick<EmailAdministrationService, 'upsertEmail'>>
    domainPolicy: jest.Mocked<Pick<DomainPolicyService, 'isVerificationAllowed'>>
    observer: jest.Mocked<VerificationTraceObserver>
    orchestrator: EmailVerificationOrchestrator
}

function fixture(): Fixture {
    const mailboxVerification = { verify: jest.fn().mockResolvedValue(probeResult) }
    const verificationStore = { create: jest.fn().mockResolvedValue(verificationRecord()) }
    const emailAdministration = { upsertEmail: jest.fn().mockResolvedValue(undefined) }
    const domainPolicy = { isVerificationAllowed: jest.fn().mockResolvedValue(true) }
    const observer = { enqueued: jest.fn(), completed: jest.fn(), failed: jest.fn(), batchCompleted: jest.fn() }
    const orchestrator = new EmailVerificationOrchestrator(
        mailboxVerification as unknown as MailboxVerificationService,
        verificationStore,
        emailAdministration as unknown as EmailAdministrationService,
        domainPolicy as unknown as DomainPolicyService,
        observer,
    )
    return { mailboxVerification, verificationStore, emailAdministration, domainPolicy, observer, orchestrator }
}

describe('EmailVerificationOrchestrator', () => {
    it('normalizes the address, checks domain policy, and persists an owned result', async () => {
        const { mailboxVerification, verificationStore, emailAdministration, domainPolicy, orchestrator } = fixture()
        verificationStore.create.mockResolvedValue(verificationRecord({ batchId: 'batch-1' }))

        const result = await orchestrator.verify({
            organizationId,
            email: 'Person@Example.Test',
            format: EmailPatternEnum.First,
            batchId: 'batch-1',
        })

        expect(domainPolicy.isVerificationAllowed).toHaveBeenCalledWith('example.test')
        expect(emailAdministration.upsertEmail).toHaveBeenNthCalledWith(1, organizationId, email, {
            format: EmailPatternEnum.First,
            exists: null,
        })
        expect(mailboxVerification.verify).toHaveBeenCalledWith(organizationId, email, EmailPatternEnum.First)
        expect(verificationStore.create).toHaveBeenCalledWith(organizationId, { ...probeResult, batchId: 'batch-1' })
        expect(emailAdministration.upsertEmail).toHaveBeenNthCalledWith(2, organizationId, email, {
            exists: true,
            lastVerificationId: verificationId,
        })
        expect(result).toEqual(expect.objectContaining({ id: verificationId, email, batchId: 'batch-1' }))
        expect(result).not.toHaveProperty('organizationId')
    })

    it('rejects a forbidden domain before touching the email cache or mailbox verification', async () => {
        const { mailboxVerification, verificationStore, emailAdministration, domainPolicy, orchestrator } = fixture()
        domainPolicy.isVerificationAllowed.mockResolvedValue(false)

        const error = await orchestrator.verify({ organizationId, email }).catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(DomainVerificationForbiddenError)
        expect((error as Error).message).not.toContain('example.test')
        expect(emailAdministration.upsertEmail).not.toHaveBeenCalled()
        expect(mailboxVerification.verify).not.toHaveBeenCalled()
        expect(verificationStore.create).not.toHaveBeenCalled()
    })

    it('reports completion to the trace observer without leaking the address', async () => {
        const { observer, orchestrator } = fixture()
        const trace = { operationId: '30000000-0000-4000-8000-000000000001', mode: 'batch_child' as const }

        await orchestrator.verify({ organizationId, email, trace })

        expect(observer.completed).toHaveBeenCalledWith({
            ...trace,
            verificationId,
            reason: EmailVerificationReason.AcceptedEmail,
            durationMs: expect.any(Number),
        })
        expect(JSON.stringify(observer.completed.mock.calls)).not.toContain(email)
    })

    it.each(['domain_policy', 'email_cache_prepare', 'verification_probe', 'verification_persist', 'email_cache_finalize'])(
        'reports the %s stage and preserves the original error even when the observer throws',
        async stage => {
            const { mailboxVerification, verificationStore, emailAdministration, domainPolicy, observer, orchestrator } =
                fixture()
            const error = new Error('private SMTP response for ' + email)
            if (stage === 'domain_policy') domainPolicy.isVerificationAllowed.mockRejectedValue(error)
            if (stage === 'email_cache_prepare') emailAdministration.upsertEmail.mockRejectedValueOnce(error)
            if (stage === 'verification_probe') mailboxVerification.verify.mockRejectedValue(error)
            if (stage === 'verification_persist') verificationStore.create.mockRejectedValue(error)
            if (stage === 'email_cache_finalize')
                emailAdministration.upsertEmail.mockResolvedValueOnce({} as Email).mockRejectedValueOnce(error)
            observer.failed.mockImplementation(() => {
                throw new Error('observer unavailable')
            })

            await expect(orchestrator.verify({ organizationId, email })).rejects.toBe(error)

            expect(observer.failed).toHaveBeenCalledWith(
                expect.objectContaining({ stage, errorType: 'Error', durationMs: expect.any(Number) }),
            )
            expect(observer.completed).not.toHaveBeenCalled()
            expect(JSON.stringify(observer.failed.mock.calls)).not.toContain(email)
        },
    )

    it('still persists and finalizes the cache when completion logging fails', async () => {
        const { observer, verificationStore, emailAdministration, orchestrator } = fixture()
        observer.completed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })

        await expect(orchestrator.verify({ organizationId, email })).resolves.toMatchObject({
            id: verificationId,
            email,
        })
        expect(verificationStore.create).toHaveBeenCalledTimes(1)
        expect(emailAdministration.upsertEmail).toHaveBeenCalledTimes(2)
        expect(observer.failed).not.toHaveBeenCalled()
    })
})
