import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { Email } from '../../../domain/email'
import { EmailVerification, OwnedEmailVerification } from '../../../domain/email-verification'
import { DomainVerificationForbiddenError } from '../../../domain/errors'
import { DomainPolicyService } from '../../domain-policy.service'
import { EmailAdministrationService } from '../../email-administration.service'
import { EmailVerificationOrchestrator } from '../../email-verification.service'
import { MailboxVerificationService } from '../../mailbox-verification.service'
import { AccountDiscovery } from '../../ports/account-discovery'
import { DomainStore } from '../../ports/domain-store'
import { EmailStore } from '../../ports/email-store'
import { MailboxProbe } from '../../ports/mailbox-probe'
import { VerificationStore } from '../../ports/verification-store'
import { VerificationTraceObserver } from '../../verification-trace/verification-trace-observer'
import { RunSynchronousVerification, SynchronousVerificationCore } from './run-synchronous-verification'

const organizationId = '10000000-0000-4000-8000-000000000001'
const otherOrganizationId = '10000000-0000-4000-8000-000000000002'
const email = 'person@example.test'
const date = new Date('2026-09-07T00:00:00.000Z')

interface Fixture {
    command: RunSynchronousVerification
    domainStore: jest.Mocked<DomainStore>
    emailStore: jest.Mocked<EmailStore>
    verificationStore: jest.Mocked<VerificationStore>
    mailboxProbe: jest.Mocked<MailboxProbe>
    accountDiscovery: jest.Mocked<AccountDiscovery>
    observer: jest.Mocked<VerificationTraceObserver>
    emails: Map<string, Email>
    verifications: EmailVerification[]
}

function fixture(): Fixture {
    const emails = new Map<string, Email>()
    const verifications: EmailVerification[] = []
    const domainStore: jest.Mocked<DomainStore> = { findByName: jest.fn().mockResolvedValue(null) }
    const emailStore: jest.Mocked<EmailStore> = {
        findByAddress: jest.fn(),
        findAllForOrganization: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
    }
    emailStore.upsert.mockImplementation((owner, address, changes) => {
        const key = `${owner}:${address}`
        const [username, domain] = address.split('@')
        const record: Email = {
            organizationId: owner,
            id: address,
            username,
            domain,
            exists: null,
            createdAt: date,
            updatedAt: date,
            ...emails.get(key),
            ...changes,
        }
        emails.set(key, record)
        return Promise.resolve(record)
    })
    const verificationStore: jest.Mocked<VerificationStore> = { create: jest.fn() }
    verificationStore.create.mockImplementation((owner, result) => {
        const record: EmailVerification = {
            ...result,
            organizationId: owner,
            id: `20000000-0000-4000-8000-${String(verifications.length + 1).padStart(12, '0')}`,
            createdAt: date,
        }
        verifications.push(record)
        return Promise.resolve(record)
    })
    const mailboxProbe: jest.Mocked<MailboxProbe> = { probe: jest.fn() }
    mailboxProbe.probe.mockImplementation((_owner, address) =>
        Promise.resolve({
            email: address,
            exists: address === email,
            reason: address === email ? EmailVerificationReason.AcceptedEmail : EmailVerificationReason.RejectedEmail,
            targetExchange: 'mx.example.test',
        }),
    )
    const accountDiscovery: jest.Mocked<AccountDiscovery> = { discover: jest.fn().mockResolvedValue([]) }
    const observer: jest.Mocked<VerificationTraceObserver> = {
        enqueued: jest.fn(),
        completed: jest.fn(),
        failed: jest.fn(),
        batchCompleted: jest.fn(),
    }
    const core = new EmailVerificationOrchestrator(
        new MailboxVerificationService(mailboxProbe, accountDiscovery),
        verificationStore,
        new EmailAdministrationService(emailStore),
        new DomainPolicyService(domainStore),
        observer,
    )

    return {
        command: new RunSynchronousVerification(core),
        domainStore,
        emailStore,
        verificationStore,
        mailboxProbe,
        accountDiscovery,
        observer,
        emails,
        verifications,
    }
}

describe('RunSynchronousVerification', () => {
    it('normalizes the email and preserves the core result and sync trace', async () => {
        const result: OwnedEmailVerification = {
            id: '20000000-0000-4000-8000-000000000001',
            email,
            domain: 'example.test',
            localPart: 'person',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
            createdAt: date,
        }
        const core: jest.Mocked<SynchronousVerificationCore> = { verify: jest.fn().mockResolvedValue(result) }
        const command = new RunSynchronousVerification(core)
        const trace = { operationId: '30000000-0000-4000-8000-000000000001', mode: 'sync' as const }

        await expect(command.execute({ organizationId, email: 'Person@Example.Test', trace })).resolves.toBe(result)

        expect(core.verify).toHaveBeenCalledTimes(1)
        expect(core.verify).toHaveBeenCalledWith({ organizationId, email, trace })
    })

    it('returns a successful owned result through the real core and finalizes its email cache', async () => {
        const { command, domainStore, emailStore, verificationStore, mailboxProbe, accountDiscovery, observer } =
            fixture()

        const result = await command.execute({ organizationId, email: 'Person@Example.Test' })

        expect(result).toMatchObject({
            email,
            domain: 'example.test',
            localPart: 'person',
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            sources: [EmailVerificationSource.MX],
        })
        expect(result).not.toHaveProperty('organizationId')
        expect(domainStore.findByName).toHaveBeenCalledWith('example.test')
        expect(mailboxProbe.probe).toHaveBeenCalledTimes(2)
        expect(mailboxProbe.probe).toHaveBeenLastCalledWith(organizationId, email)
        expect(verificationStore.create).toHaveBeenCalledTimes(1)
        expect(emailStore.upsert).toHaveBeenLastCalledWith(organizationId, email, {
            exists: true,
            lastVerificationId: result.id,
        })
        expect(accountDiscovery.discover).not.toHaveBeenCalled()
        expect(observer.completed).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'sync', operationId: expect.any(String), verificationId: result.id }),
        )
    })

    it('preserves a prohibited-domain failure without preparing a cache or probing a mailbox', async () => {
        const { command, domainStore, emailStore, mailboxProbe, verificationStore } = fixture()
        domainStore.findByName.mockResolvedValue({
            name: 'example.test',
            isVerificationForbidden: true,
            catchAllEnabled: null,
            isFree: false,
            isDisposable: false,
            createdAt: date,
            updatedAt: date,
        })

        await expect(command.execute({ organizationId, email })).rejects.toBeInstanceOf(
            DomainVerificationForbiddenError,
        )

        expect(emailStore.upsert).not.toHaveBeenCalled()
        expect(mailboxProbe.probe).not.toHaveBeenCalled()
        expect(verificationStore.create).not.toHaveBeenCalled()
    })

    it('returns and persists an indeterminate result without converting it into a rejection', async () => {
        const { command, mailboxProbe, accountDiscovery, verificationStore, emails } = fixture()
        mailboxProbe.probe.mockResolvedValue({
            email,
            exists: null,
            reason: EmailVerificationReason.SecureTransportUnavailable,
            targetExchange: 'mx.example.test',
        })

        const result = await command.execute({ organizationId, email })

        expect(result).toMatchObject({
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.SecureTransportUnavailable,
            sources: [],
        })
        expect(mailboxProbe.probe).toHaveBeenCalledTimes(1)
        expect(accountDiscovery.discover).not.toHaveBeenCalled()
        expect(verificationStore.create).toHaveBeenCalledTimes(1)
        expect(emails.get(`${organizationId}:${email}`)).toMatchObject({
            exists: null,
            lastVerificationId: result.id,
        })
    })

    it('propagates the original adapter failure and reports the supplied sync trace', async () => {
        const { command, mailboxProbe, verificationStore, emailStore, observer } = fixture()
        const error = new Error('mailbox_adapter_failed')
        const trace = { operationId: '30000000-0000-4000-8000-000000000001', mode: 'sync' as const }
        mailboxProbe.probe.mockRejectedValue(error)

        await expect(command.execute({ organizationId, email, trace })).rejects.toBe(error)

        expect(emailStore.upsert).toHaveBeenCalledTimes(1)
        expect(emailStore.upsert).toHaveBeenCalledWith(organizationId, email, {
            format: undefined,
            exists: null,
        })
        expect(verificationStore.create).not.toHaveBeenCalled()
        expect(observer.completed).not.toHaveBeenCalled()
        expect(observer.failed).toHaveBeenCalledWith(
            expect.objectContaining({ ...trace, stage: 'verification_probe', errorType: 'Error' }),
        )
    })

    it('keeps probes, results, and latest-result links separate for two organizations verifying the same address', async () => {
        const { command, mailboxProbe, emails, verifications } = fixture()
        mailboxProbe.probe.mockImplementation((owner, address) =>
            Promise.resolve({
                email: address,
                exists: owner === organizationId && address === email,
                reason:
                    owner === organizationId && address === email
                        ? EmailVerificationReason.AcceptedEmail
                        : EmailVerificationReason.RejectedEmail,
                targetExchange: 'mx.example.test',
            }),
        )

        const firstResult = await command.execute({ organizationId, email: 'Person@Example.Test' })
        const secondResult = await command.execute({ organizationId: otherOrganizationId, email })

        expect(firstResult.exists).toBe(true)
        expect(secondResult.exists).toBe(false)
        expect(firstResult.id).not.toBe(secondResult.id)
        expect(mailboxProbe.probe).toHaveBeenCalledWith(organizationId, email)
        expect(mailboxProbe.probe).toHaveBeenCalledWith(otherOrganizationId, email)
        expect(verifications).toEqual([
            { ...firstResult, organizationId },
            { ...secondResult, organizationId: otherOrganizationId },
        ])
        expect(emails.get(`${organizationId}:${email}`)).toMatchObject({
            organizationId,
            exists: true,
            lastVerificationId: firstResult.id,
        })
        expect(emails.get(`${otherOrganizationId}:${email}`)).toMatchObject({
            organizationId: otherOrganizationId,
            exists: false,
            lastVerificationId: secondResult.id,
        })
        expect(firstResult).not.toHaveProperty('organizationId')
        expect(secondResult).not.toHaveProperty('organizationId')
    })
})
