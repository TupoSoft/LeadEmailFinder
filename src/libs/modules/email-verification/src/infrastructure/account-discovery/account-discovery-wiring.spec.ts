import { HttpService } from '@nestjs/axios'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModulesContainer } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { AccountDiscoveryApproval, loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import { DnsModule, DnsService } from '@tuposoft/lead-email-finder/dns'
import { CreditGuard, CreditReservationService, CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_SERVICE_TOKEN,
    ProxyModule,
} from '@tuposoft/lead-email-finder/modules/proxy'
import { of } from 'rxjs'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
} from '../../application/account-discovery/approved-account-discovery-verifier'
import { MailboxVerificationService } from '../../application/mailbox-verification.service'
import { AccountDiscovery, ACCOUNT_DISCOVERY_TOKEN } from '../../application/ports/account-discovery'
import { MAILBOX_PROBE, MailboxProbeResult } from '../../application/ports/mailbox-probe'
import { CatchAllProxyConfiguration } from '../../domain/email-verification-configuration'
import { EmailVerificationCoreModule } from '../email-verification-core.module'
import { SmtpClientFactory } from '../mailbox/smtp/smtp-client.factory'
import { SmtpMailboxProbe } from '../mailbox/smtp/smtp-mailbox-probe'
import { DomainPolicyEntity } from '../persistence/typeorm/domain-policy.entity'
import { EmailVerificationEntity } from '../persistence/typeorm/email-verification.entity'
import { EmailEntity } from '../persistence/typeorm/email.entity'
import { SmtpVerificationEntity } from '../persistence/typeorm/smtp-verification.entity'
import { VerificationRequestEntity } from '../persistence/typeorm/verification-request.entity'
import { VerificationExecutionEntity } from '../persistence/typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from '../persistence/typeorm/verification-settlement-intention.entity'
import { VerificationExecutionPermitEntity } from '../persistence/typeorm/verification-execution-permit.entity'
import { VerificationExecutionPermitLockEntity } from '../persistence/typeorm/verification-execution-permit-lock.entity'

const CORE_MODULE_ENTITIES = [
    EmailEntity,
    DomainPolicyEntity,
    EmailVerificationEntity,
    SmtpVerificationEntity,
    VerificationRequestEntity,
    VerificationExecutionEntity,
    VerificationSettlementIntentionEntity,
    VerificationExecutionPermitEntity,
    VerificationExecutionPermitLockEntity,
]
import { ACCOUNT_DISCOVERY_CLOCK_TOKEN } from './configured-account-discovery'
import { AccountDiscoveryModule } from './account-discovery.module'
import { MicrosoftGetCredentialType } from './providers/microsoft-get-credential-type'
import { MicrosoftLogin } from './providers/microsoft-login'
import { MimecastLogin } from './providers/mimecast-login'
import { OfficeApps } from './providers/office-apps'

jest.mock('@tuposoft/lead-email-finder/config', () => ({
    ...jest.requireActual<typeof import('@tuposoft/lead-email-finder/config')>('@tuposoft/lead-email-finder/config'),
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
    verificationQuality: 'inconclusive',
    evidenceObservedAt: null,
    evidencePolicyVersion: 1,
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

// Satisfies the raw DataSource/CreditReservationService constructor dependencies the verification-billing
// factories in EmailVerificationCoreModule now require, independently of whichever module the test overrides
// TypeORM's or credits' own providers with — global, so every branch of this isolated tree can see it.
@Global()
@Module({
    providers: [
        { provide: DataSource, useValue: {} },
        { provide: CreditReservationService, useValue: {} },
    ],
    exports: [DataSource, CreditReservationService],
})
class FakeBillingInfrastructureModule {}

interface WiringFixture {
    http: Record<'get' | 'post', jest.Mock>
    mailboxProbe: { probe: jest.Mock<Promise<MailboxProbeResult>, [string, string]> }
    clock: { now: jest.Mock<Date, []> }
    dns: { resolve: jest.Mock }
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
        const mailboxProbe = {
            probe: jest.fn(
                (_organizationId: string, submittedEmail: string): Promise<MailboxProbeResult> =>
                    Promise.resolve({
                        email: submittedEmail,
                        exists: true,
                        reason: 'accepted_email',
                        targetExchange: 'mx.example.test',
                        evidence: { kind: 'none' },
                    }),
            ),
        }
        const clock = { now: jest.fn(() => new Date('2026-09-06T10:30:00.000Z')) }
        const dns = {
            resolve: jest.fn(() => {
                throw new Error('unexpected_dns_lookup')
            }),
        }
        jest.mocked(loadAccountDiscoveryApprovals).mockResolvedValue({
            schemaVersion: 1,
            revision: 'wiring-fixture',
            approvals,
        })

        @Module({ providers: [{ provide: DnsService, useValue: dns }], exports: [DnsService] })
        class FakeDnsModule {}

        // Preserve the core composition root and AccountDiscoveryModule. Only outbound adapters and
        // unrelated business capabilities are substituted.
        const builder = Test.createTestingModule({ imports: [FakeBillingInfrastructureModule, EmailVerificationCoreModule] })
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
            .overrideProvider(MAILBOX_PROBE)
            .useValue(mailboxProbe)
            .overrideProvider(ACCOUNT_DISCOVERY_CLOCK_TOKEN)
            .useValue(clock)

        for (const entity of CORE_MODULE_ENTITIES) {
            builder.overrideProvider(getRepositoryToken(entity)).useValue({})
        }

        return {
            http,
            mailboxProbe,
            clock,
            dns,
            compile: async () => {
                const module = await builder.compile()
                modules.push(module)
                await module.init()
                const discoveryRegistrations = [...module.get(ModulesContainer).values()].filter(nestModule =>
                    nestModule.providers.has(ACCOUNT_DISCOVERY_TOKEN),
                )
                expect(discoveryRegistrations).toHaveLength(1)
                expect(discoveryRegistrations[0].metatype).toBe(AccountDiscoveryModule)
                expect([...discoveryRegistrations[0].exports]).toEqual([ACCOUNT_DISCOVERY_TOKEN])
                expect(module.select(EmailVerificationCoreModule).get(MAILBOX_PROBE, { strict: true })).toBe(
                    mailboxProbe,
                )
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

    it('resolves the real SMTP probe and discovery factories without outbound or persistence calls', async () => {
        const dns = { resolve: jest.fn() }
        const proxyService = { addToBlacklist: jest.fn() }
        const proxyAllocator = { acquire: jest.fn(), release: jest.fn() }
        const allocationObserver = { onConnectionOutcome: jest.fn() }
        const http = { get: jest.fn(), post: jest.fn() }
        const repository = { findOneBy: jest.fn(), upsert: jest.fn() }
        const createSmtpClient = jest.spyOn(SmtpClientFactory.prototype, 'create')
        jest.mocked(loadAccountDiscoveryApprovals).mockResolvedValue({
            schemaVersion: 1,
            revision: 'smtp-composition-fixture',
            approvals: [],
        })

        @Module({ providers: [{ provide: DnsService, useValue: dns }], exports: [DnsService] })
        class FakeDnsModule {}

        @Module({
            providers: [
                { provide: PROXY_SERVICE_TOKEN, useValue: proxyService },
                { provide: PROXY_ALLOCATOR_TOKEN, useValue: proxyAllocator },
                { provide: ALLOCATION_OBSERVER_TOKEN, useValue: allocationObserver },
            ],
            exports: [PROXY_SERVICE_TOKEN, PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN],
        })
        class FakeProxyModule {}

        const builder = Test.createTestingModule({ imports: [FakeBillingInfrastructureModule, EmailVerificationCoreModule] })
            .overrideModule(DnsModule)
            .useModule(FakeDnsModule)
            .overrideModule(ProxyModule)
            .useModule(FakeProxyModule)
            .overrideModule(CreditsModule)
            .useModule(UnusedBusinessDependenciesModule)
            .overrideProvider(ConfigService)
            .useValue({ get: jest.fn() })
            .overrideProvider(HttpService)
            .useValue(http)

        for (const entity of CORE_MODULE_ENTITIES) {
            builder.overrideProvider(getRepositoryToken(entity)).useValue(repository)
        }

        const module = await builder.compile()
        modules.push(module)
        await module.init()

        expect(module.select(EmailVerificationCoreModule).get(MAILBOX_PROBE, { strict: true })).toBeInstanceOf(
            SmtpMailboxProbe,
        )
        expect(module.get(MailboxVerificationService)).toBeInstanceOf(MailboxVerificationService)
        const discovery = module.select(AccountDiscoveryModule).get<AccountDiscovery>(ACCOUNT_DISCOVERY_TOKEN, {
            strict: true,
        })
        await expect(discovery.discover(email)).resolves.toEqual([])
        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(
            [...module.get(ModulesContainer).values()].filter(nestModule =>
                nestModule.providers.has(ACCOUNT_DISCOVERY_TOKEN),
            ),
        ).toHaveLength(1)

        for (const operation of [
            dns.resolve,
            proxyService.addToBlacklist,
            proxyAllocator.acquire,
            proxyAllocator.release,
            allocationObserver.onConnectionOutcome,
            http.get,
            http.post,
            repository.findOneBy,
            repository.upsert,
            createSmtpClient,
        ]) {
            expect(operation).not.toHaveBeenCalled()
        }
    })

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
        expect(dependencies.mailboxProbe.probe).toHaveBeenCalledTimes(1)
        expect(dependencies.mailboxProbe.probe).toHaveBeenCalledWith(
            organizationId,
            'tbbjjmqeykhtazzwggmzrxterzetrwgwxnavfgnjkdunvgziak@example.test',
            undefined,
        )
        expect(dependencies.dns.resolve).not.toHaveBeenCalled()
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
        expect(dependencies.mailboxProbe.probe).toHaveBeenCalledTimes(1)
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
        expect(dependencies.mailboxProbe.probe).toHaveBeenCalledTimes(1)
    })

    it('rejects Nest initialization before dispatch when the selected provider has no approval', async () => {
        const dependencies = fixture(enabledConfiguration, [])

        await expect(dependencies.compile()).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
        expect(dependencies.mailboxProbe.probe).not.toHaveBeenCalled()
        expect(dependencies.dns.resolve).not.toHaveBeenCalled()
    })
})
