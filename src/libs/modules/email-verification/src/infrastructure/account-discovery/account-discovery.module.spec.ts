import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { AccountDiscoveryApproval, loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import { Observable, of, throwError } from 'rxjs'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryProviderName,
} from '../../application/account-discovery/approved-account-discovery-verifier'
import { AccountDiscovery, ACCOUNT_DISCOVERY_TOKEN } from '../../application/ports/account-discovery'
import { CatchAllProxyConfiguration } from '../../domain/email-verification-configuration'
import { AccountDiscoveryModule } from './account-discovery.module'
import { ACCOUNT_DISCOVERY_CLOCK_TOKEN } from './configured-account-discovery'

jest.mock('@tuposoft/lead-email-finder/config', () => ({
    ...jest.requireActual<typeof import('@tuposoft/lead-email-finder/config')>('@tuposoft/lead-email-finder/config'),
    loadAccountDiscoveryApprovals: jest.fn(),
}))

const email = 'person@example.test'
const approvalExpiresAt = '2026-09-06T11:00:00.000Z'
const enabledConfiguration: CatchAllProxyConfiguration = {
    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example.test:8080',
    CATCH_ALL_PROVIDER: 'office_apps',
    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-module-fixture',
    CATCH_ALL_PROVIDER_REGION: 'us',
}

function approval(overrides: Partial<AccountDiscoveryApproval> = {}): AccountDiscoveryApproval {
    return {
        id: 'approval-module-fixture',
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
        ...overrides,
    }
}

interface ModuleFixture {
    http: Record<'get' | 'post', jest.Mock<Observable<unknown>, [string]>>
    clock: { now: jest.Mock<Date, []> }
    initialize(): Promise<AccountDiscovery>
}

describe(AccountDiscoveryModule.name, () => {
    const modules: TestingModule[] = []

    afterEach(async () => {
        await Promise.all(modules.splice(0).map(module => module.close()))
        jest.mocked(loadAccountDiscoveryApprovals).mockReset()
    })

    function fixture(configuration: CatchAllProxyConfiguration, approvals: AccountDiscoveryApproval[]): ModuleFixture {
        const http = {
            get: jest.fn((_url: string) => of({ data: 'OrgId' })),
            post: jest.fn((_url: string) => of({ data: {} })),
        }
        const clock = { now: jest.fn(() => new Date('2026-09-06T10:30:00.000Z')) }
        jest.mocked(loadAccountDiscoveryApprovals).mockResolvedValue({
            schemaVersion: 1,
            revision: 'module-fixture',
            approvals,
        })

        const builder = Test.createTestingModule({
            imports: [AccountDiscoveryModule],
            providers: [
                {
                    provide: 'discovery-consumer',
                    inject: [ACCOUNT_DISCOVERY_TOKEN],
                    useFactory: (discovery: AccountDiscovery) => discovery,
                },
            ],
        })
            .overrideProvider(ConfigService)
            .useValue({ get: (key: keyof CatchAllProxyConfiguration) => configuration[key] })
            .overrideProvider(HttpService)
            .useValue(http)
            .overrideProvider(ACCOUNT_DISCOVERY_CLOCK_TOKEN)
            .useValue(clock)

        return {
            http,
            clock,
            initialize: async () => {
                const module = await builder.compile()
                modules.push(module)
                await module.init()
                const discovery = module.get<AccountDiscovery>('discovery-consumer')
                expect(discovery).toBe(
                    module.select(AccountDiscoveryModule).get(ACCOUNT_DISCOVERY_TOKEN, { strict: true }),
                )
                return discovery
            },
        }
    }

    it.each([
        ['no provider configuration', {}],
        ['only a proxy configured', { CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example.test:8080' }],
    ])('initializes without dispatch with %s', async (_scenario, configuration) => {
        const dependencies = fixture(configuration, [])
        const discovery = await dependencies.initialize()

        await expect(discovery.discover(email)).resolves.toEqual([])

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
    })

    it.each<{
        provider: AccountDiscoveryProviderName
        region: string
        sourceName: string
        method: 'get' | 'post'
        url: string
    }>([
        {
            provider: 'office_apps',
            region: 'us',
            sourceName: 'microsoft_2',
            method: 'get',
            url: `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=0&emailAddress=${email}`,
        },
        {
            provider: 'microsoft_get_credential_type',
            region: 'us',
            sourceName: 'microsoft_4',
            method: 'post',
            url: 'https://login.microsoftonline.com/common/GetCredentialType',
        },
        {
            provider: 'microsoft_login',
            region: 'us',
            sourceName: 'microsoft_1',
            method: 'post',
            url: 'https://login.microsoft.com/common/oauth2/token',
        },
        ...(['us', 'uk'] as const).map(region => ({
            provider: 'mimecast' as const,
            region,
            sourceName: 'mimecast',
            method: 'post' as const,
            url: `https://login-${region}.mimecast.com/u/proxy/api/login/discover-authentication`,
        })),
    ])('dispatches only the approved $provider provider in $region', async testCase => {
        const { provider, region, sourceName, method, url } = testCase
        const dependencies = fixture(
            { ...enabledConfiguration, CATCH_ALL_PROVIDER: provider, CATCH_ALL_PROVIDER_REGION: region },
            [approval({ provider, region })],
        )
        if (provider === 'microsoft_login') {
            dependencies.http.post.mockReturnValue(throwError(() => ({ response: { data: { error_codes: [50126] } } })))
        } else if (provider === 'microsoft_get_credential_type') {
            dependencies.http.post.mockReturnValue(of({ data: { IfExistsResult: 0 } }))
        } else if (provider === 'mimecast') {
            dependencies.http.post.mockReturnValue(of({ data: { data: [{ authenticate: ['Basic-Ad'] }] } }))
        }

        const discovery = await dependencies.initialize()
        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()

        await expect(discovery.discover(email)).resolves.toEqual([{ sourceName }])

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(dependencies.http[method]).toHaveBeenCalledTimes(1)
        expect(dependencies.http[method].mock.calls[0][0]).toBe(url)
        expect(dependencies.http[method === 'get' ? 'post' : 'get']).not.toHaveBeenCalled()
    })

    const invalidSelections: [string, CatchAllProxyConfiguration][] = [
        ['unknown provider', { ...enabledConfiguration, CATCH_ALL_PROVIDER: 'unknown' }],
        ['missing proxy', { ...enabledConfiguration, CATCH_ALL_HTTP_PROXY_URL: undefined }],
        ['missing approval ID', { ...enabledConfiguration, CATCH_ALL_PROVIDER_APPROVAL_ID: undefined }],
        ['missing region', { ...enabledConfiguration, CATCH_ALL_PROVIDER_REGION: undefined }],
        ['approval ID without a provider', { CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-module-fixture' }],
        ['region without a provider', { CATCH_ALL_PROVIDER_REGION: 'us' }],
        [
            'unsupported Mimecast region',
            { ...enabledConfiguration, CATCH_ALL_PROVIDER: 'mimecast', CATCH_ALL_PROVIDER_REGION: 'eu' },
        ],
    ]

    it.each(invalidSelections)(
        'rejects initialization with %s before any dispatch',
        async (_scenario, configuration) => {
            const dependencies = fixture(configuration, [approval()])

            await expect(dependencies.initialize()).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)

            expect(dependencies.http.get).not.toHaveBeenCalled()
            expect(dependencies.http.post).not.toHaveBeenCalled()
        },
    )

    const invalidApprovals: [string, AccountDiscoveryApproval[]][] = [
        ['no approval', []],
        ['a different approval ID', [approval({ id: 'different-approval' })]],
        ['a different provider', [approval({ provider: 'microsoft_login' })]],
        ['a different region', [approval({ region: 'uk' })]],
        ['a suspended approval', [approval({ status: 'suspended' })]],
        ['a revoked approval', [approval({ status: 'revoked' })]],
        ['an expired approval status', [approval({ status: 'expired' })]],
        ['an expired approval time', [approval({ expiresAt: '2026-09-06T10:30:00.000Z' })]],
        ['a premature approval', [approval({ effectiveAt: '2026-09-06T10:31:00.000Z' })]],
    ]

    it.each(invalidApprovals)('rejects initialization with %s before any dispatch', async (_scenario, approvals) => {
        const dependencies = fixture(enabledConfiguration, approvals)

        await expect(dependencies.initialize()).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)

        expect(dependencies.http.get).not.toHaveBeenCalled()
        expect(dependencies.http.post).not.toHaveBeenCalled()
    })

    it('rechecks approval before each disclosure after initialization', async () => {
        const dependencies = fixture(enabledConfiguration, [approval()])
        const discovery = await dependencies.initialize()

        await expect(discovery.discover(email)).resolves.toEqual([{ sourceName: 'microsoft_2' }])
        expect(dependencies.http.get).toHaveBeenCalledTimes(1)

        dependencies.clock.now.mockReturnValue(new Date(approvalExpiresAt))
        await expect(discovery.discover('later@example.test')).resolves.toEqual([])

        expect(loadAccountDiscoveryApprovals).toHaveBeenCalledTimes(1)
        expect(dependencies.http.get).toHaveBeenCalledTimes(1)
        expect(dependencies.http.post).not.toHaveBeenCalled()
    })

    it('returns no evidence for a provider transport failure after valid initialization', async () => {
        const dependencies = fixture(enabledConfiguration, [approval()])
        dependencies.http.get.mockReturnValue(throwError(() => new Error('synthetic transport failure')))
        const discovery = await dependencies.initialize()

        await expect(discovery.discover(email)).resolves.toEqual([])

        expect(dependencies.http.get).toHaveBeenCalledTimes(1)
        expect(dependencies.http.post).not.toHaveBeenCalled()
    })
})
