import { HttpService } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { EmailVerificationReason, ISmtpVerificationResponse, ISmtpVerifier } from '@tuposoft/lead-email-finder/common'
import { AccountDiscoveryApproval, loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { CreditGuard, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import { ProxyModule } from '@tuposoft/lead-email-finder/modules/proxy'
import { of } from 'rxjs'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
} from '../../application/account-discovery/approved-account-discovery-verifier'
import { MailboxVerificationService } from '../../application/mailbox-verification.service'
import { CatchAllProxyConfiguration } from '../../email-verification-configuration'
import { ACCOUNT_DISCOVERY_CLOCK_TOKEN } from '../../email-verifier/email-verifier.constants'
import { SmtpVerifier } from '../../email-verifier/smtp'
import { SmtpClientFactory } from '../../email-verifier/smtp/smtp-client.factory'
import { SmtpVerification } from '../../email-verifier/smtp/smtp-verification.entity'
import { SyncEmailVerificationModule } from '../../sync-email-verification/email-verification.module'
import { DomainPolicyEntity } from '../persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from '../persistence/typeorm/email-verification.entity'
import { EmailEntity } from '../persistence/typeorm/email.entity'

jest.mock('@tuposoft/lead-email-finder/config', () => ({
    ...jest.requireActual<typeof import('@tuposoft/lead-email-finder/config')>(
        '@tuposoft/lead-email-finder/config',
    ),
    loadAccountDiscoveryApprovals: jest.fn(),
}))

const email = 'person@example.test'
const organizationId = '1d33b587-bc90-49f7-9693-92d72cc5c271'
const approvalExpiresAt = '2026-09-06T11:00:00.000Z'
const enabledConfiguration: CatchAllProxyConfiguration = {
    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example.test:8080',
    CATCH_ALL_PROVIDER: 'office_apps',
    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-wiring-fixture',
    CATCH_ALL_PROVIDER_REGION: 'us',
}
const preDiscoveryResult = {
    exists: null,
    catchAll: true,
    reason: EmailVerificationReason.AcceptedEmail,
    sources: [],
    domain: 'example.test',
    localPart: 'person',
    email,
    format: undefined,
    targetExchange: 'mx.example.test',
    mxDomain: 'example.test',
}

function approval(): AccountDiscoveryApproval {
    return {
        id: 'approval-wiring-fixture',
        status: 'active',
        provider: 'office_apps',
        purpose: ACCOUNT_DISCOVERY_PURPOSE,
        region: 'us',
        effectiveAt: '2026-09-06T10:00:00.000Z',
        expiresAt: approvalExpiresAt,
        processingContractVersion: 'contract-fixture',
        recipientRegisterId: 'recipient-fixture',
        vendorReviewEvidenceId: 'vendor-review-fixture',
        securityReviewEvidenceId: 'security-review-fixture',
        transferReviewEvidenceId: 'transfer-review-fixture',
        customerAuthorizationEvidenceId: 'authorization-fixture',
        approvalOwner: 'owner-fixture',
        reviewedAt: '2026-09-06T09:00:00.000Z',
    }
}

@Module({})
class UnusedBusinessDependenciesModule {}

interface WiringFixture {
    http: Record<'get' | 'post', jest.Mock>
    smtp: jest.Mocked<ISmtpVerifier>
    clock: { now: jest.Mock<Date, []> }
    dns: { resolve: jest.Mock }
    smtpClientFactory: { create: jest.Mock }
    compile(): Promise<{
        mailbox: MailboxVerificationService
        officeApps: jest.SpyInstance
        microsoftLogin: jest.SpyInstance
        microsoftGetCredentialType: jest.SpyInstance
        mimecastRegion: jest.SpyInstance
    }>
}

describe('Account discovery Nest composition', () => {
    const modules: TestingModule[] = []

    afterEach(async () => {
        await Promise.all(modules.splice(0).map(module => module.close()))
        jest.restoreAllMocks()
        jest.mocked(loadAccountDiscoveryApprovals).mockReset()
    })

    function fixture(configuration: CatchAllProxyConfiguration, approvals: AccountDiscoveryApproval[]): WiringFixture {
        const http = {
            get: jest.fn(() => of({ data: 'OrgId' })),
            post: jest.fn(() => {
                throw new Error('unexpected_http_post')
            }),
        }
        const smtp: jest.Mocked<ISmtpVerifier> = {
            verify: jest.fn((_organizationId: string, submittedEmail: string): Promise<ISmtpVerificationResponse> =>
                Promise.resolve({
                    email: submittedEmail,
                    exists: true,
                    reason: 'accepted_email',
                    targetExchange: 'mx.example.test',
                }),
            ),
        }
        const clock = { now: jest.fn(() => new Date('2026-09-06T10:30:00.000Z')) }
        const dns = {
            resolve: jest.fn(() => {
                throw new Error('unexpected_dns_lookup')
            }),
        }
        const smtpClientFactory = {
            create: jest.fn(() => {
                throw new Error('unexpected_smtp_connection')
            }),
        }
        jest.mocked(loadAccountDiscoveryApprovals).mockResolvedValue({
            schemaVersion: 1,
            revision: 'wiring-fixture',
            approvals,
        })

        @Module({ providers: [{ provide: DnsService, useValue: dns }], exports: [DnsService] })
        class FakeDnsModule {}

        // Preserve both composition roots, CatchAllModule, and the SMTP module reexport.
        // Only outbound adapters and unrelated business capabilities are substituted.
        const builder = Test.createTestingModule({ imports: [SyncEmailVerificationModule] })
            .overrideModule(DnsModule)
            .useModule(FakeDnsModule)
            .overrideModule(ProxyModule)
            .useModule(UnusedBusinessDependenciesModule)
            .overrideModule(CreditsModule)
            .useModule(UnusedBusinessDependenciesModule)
            .overrideGuard(CreditGuard)
            .useValue({ canActivate: jest.fn(() => true) })
            .overrideProvider(ConfigService)
            .useValue({ get: (key: keyof CatchAllProxyConfiguration) => configuration[key] })
            .overrideProvider(HttpService)
            .useValue(http)
            .overrideProvider(SmtpVerifier)
            .useValue(smtp)
            .overrideProvider(SmtpClientFactory)
            .useValue(smtpClientFactory)
            .overrideProvider(ACCOUNT_DISCOVERY_CLOCK_TOKEN)
            .useValue(clock)

        for (const entity of [EmailEntity, DomainPolicyEntity, EmailVerificationEntity, SmtpVerification]) {
            builder.overrideProvider(getRepositoryToken(entity)).useValue({})
        }

        return {
            http,
            smtp,
            clock,
            dns,
            smtpClientFactory,
            compile: async () => {
                const module = await builder.compile()
                modules.push(module)
                return {
                    mailbox: module.get(MailboxVerificationService),
                    officeApps: jest.spyOn(module.get(OfficeApps), 'verify'),
                    microsoftLogin: jest.spyOn(module.get(MicrosoftLogin), 'verify'),
                    microsoftGetCredentialType: jest.spyOn(module.get(MicrosoftGetCredentialType), 'verify'),
                    mimecastRegion: jest.spyOn(module.get(MimecastLogin), 'forRegion'),
                }
            },
        }
    }

    it('resolves the real mailbox factory and dispatches once through the approved provider', async () => {
        const dependencies = fixture(enabledConfiguration, [approval()])
        const composed = await dependencies.compile()

        await expect(composed.mailbox.verify(organizationId, email)).resolves.toEqual({
            ...preDiscoveryResult,
            exists: true,
            reason: EmailVerificationReason.Webmail,
            sources: ['microsoft_2'],
        })

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(composed.officeApps).toHaveBeenCalledTimes(1)
        expect(composed.officeApps).toHaveBeenCalledWith(email)
        expect(dependencies.http.get).toHaveBeenCalledTimes(1)
        expect(dependencies.http.get).toHaveBeenCalledWith(
            `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=${email}`,
        )
        expect(dependencies.http.post).not.toHaveBeenCalled()
        expect(composed.microsoftLogin).not.toHaveBeenCalled()
        expect(composed.microsoftGetCredentialType).not.toHaveBeenCalled()
        expect(composed.mimecastRegion).not.toHaveBeenCalled()
        expect(dependencies.smtp.verify).toHaveBeenCalledTimes(1)
        expect(dependencies.smtp.verify).toHaveBeenCalledWith(
            organizationId,
            'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@example.test',
        )
        expect(dependencies.dns.resolve).not.toHaveBeenCalled()
        expect(dependencies.smtpClientFactory.create).not.toHaveBeenCalled()
    })

    it.each([
        ['no provider configuration', {}],
        ['only a proxy configured', { CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example.test:8080' }],
    ])('keeps the pre-discovery result with %s', async (_scenario, configuration) => {
        const dependencies = fixture(configuration as CatchAllProxyConfiguration, [])
        const composed = await dependencies.compile()

        await expect(composed.mailbox.verify(organizationId, email)).resolves.toEqual(preDiscoveryResult)

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(composed.officeApps).not.toHaveBeenCalled()
        expect(composed.microsoftLogin).not.toHaveBeenCalled()
        expect(composed.microsoftGetCredentialType).not.toHaveBeenCalled()
        expect(composed.mimecastRegion).not.toHaveBeenCalled()
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
        expect(dependencies.smtp.verify).toHaveBeenCalledTimes(1)
    })

    it('keeps the pre-discovery result without dispatch when approval expires after Nest compilation', async () => {
        const dependencies = fixture(enabledConfiguration, [approval()])
        const composed = await dependencies.compile()
        dependencies.clock.now.mockReturnValue(new Date(approvalExpiresAt))

        await expect(composed.mailbox.verify(organizationId, email)).resolves.toEqual(preDiscoveryResult)

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(composed.officeApps).not.toHaveBeenCalled()
        expect(composed.microsoftLogin).not.toHaveBeenCalled()
        expect(composed.microsoftGetCredentialType).not.toHaveBeenCalled()
        expect(composed.mimecastRegion).not.toHaveBeenCalled()
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
        expect(dependencies.smtp.verify).toHaveBeenCalledTimes(1)
    })

    it('rejects Nest initialization before dispatch when the selected provider has no approval', async () => {
        const dependencies = fixture(enabledConfiguration, [])

        await expect(dependencies.compile()).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
        expect(dependencies.smtp.verify).not.toHaveBeenCalled()
        expect(dependencies.dns.resolve).not.toHaveBeenCalled()
        expect(dependencies.smtpClientFactory.create).not.toHaveBeenCalled()
    })
})
