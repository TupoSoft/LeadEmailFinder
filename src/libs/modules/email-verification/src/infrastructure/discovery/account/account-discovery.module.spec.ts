import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { AccountDiscoveryProviderConfiguration } from './select-account-discovery-verifier'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    Clock,
} from '../../../application/account-discovery/approved-account-discovery-verifier'
import { ACCOUNT_DISCOVERY, AccountDiscovery } from '../../../application/ports/account-discovery'
import { AccountDiscoveryModule, configuredAccountDiscovery } from './account-discovery.module'

const clock: Clock = { now: () => new Date('2026-09-02T10:30:00Z') }

const approval = (): AccountDiscoveryApprovalView => ({
    id: 'approval-fixture-1',
    status: 'active',
    provider: 'office_apps',
    purpose: ACCOUNT_DISCOVERY_PURPOSE,
    region: 'us',
    effectiveAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-02T11:00:00.000Z',
})

function configService(
    configuration: AccountDiscoveryProviderConfiguration,
): ConfigService<AccountDiscoveryProviderConfiguration, true> {
    return {
        get: jest.fn((key: keyof AccountDiscoveryProviderConfiguration) => configuration[key]),
    } as unknown as ConfigService<AccountDiscoveryProviderConfiguration, true>
}

function adapters(): {
    microsoftGetCredentialType: MicrosoftGetCredentialType
    microsoftLogin: MicrosoftLogin
    mimecastLogin: MimecastLogin
    officeApps: OfficeApps
    officeAppsVerifier: jest.Mocked<ICatchAllVerifier>
} {
    const officeAppsVerifier = {
        sourceName: 'microsoft_2',
        verify: jest.fn().mockResolvedValue(true),
    } satisfies jest.Mocked<ICatchAllVerifier>

    return {
        microsoftGetCredentialType: {
            sourceName: 'microsoft_4',
            verify: jest.fn(),
        } as unknown as MicrosoftGetCredentialType,
        microsoftLogin: {
            sourceName: 'microsoft_1',
            verify: jest.fn(),
        } as unknown as MicrosoftLogin,
        mimecastLogin: {
            forRegion: jest.fn(),
        } as unknown as MimecastLogin,
        officeApps: officeAppsVerifier as unknown as OfficeApps,
        officeAppsVerifier,
    }
}

describe(configuredAccountDiscovery.name, () => {
    it('exports the absent provider through Nest wiring with the committed empty manifest', async () => {
        const providerAdapters = adapters()
        const module = await Test.createTestingModule({
            imports: [AccountDiscoveryModule],
            providers: [
                {
                    provide: 'account-discovery-consumer',
                    inject: [ACCOUNT_DISCOVERY],
                    useFactory: (discovery: AccountDiscovery | undefined) => ({ discovery }),
                },
            ],
        })
            .overrideProvider(ConfigService)
            .useValue(configService({}))
            .overrideProvider(MicrosoftGetCredentialType)
            .useValue(providerAdapters.microsoftGetCredentialType)
            .overrideProvider(MicrosoftLogin)
            .useValue(providerAdapters.microsoftLogin)
            .overrideProvider(MimecastLogin)
            .useValue(providerAdapters.mimecastLogin)
            .overrideProvider(OfficeApps)
            .useValue(providerAdapters.officeApps)
            .compile()

        try {
            expect(module.get<{ discovery: AccountDiscovery | undefined }>('account-discovery-consumer')).toEqual({
                discovery: undefined,
            })
            expect(providerAdapters.microsoftGetCredentialType.verify).not.toHaveBeenCalled()
            expect(providerAdapters.microsoftLogin.verify).not.toHaveBeenCalled()
            expect(providerAdapters.mimecastLogin.forRegion).not.toHaveBeenCalled()
            expect(providerAdapters.officeApps.verify).not.toHaveBeenCalled()
        } finally {
            await module.close()
        }
    })

    it('redacts manifest loader failures during startup', async () => {
        const providerAdapters = adapters()
        const sentinel = 'manifest-sentinel@example.test'
        const error: unknown = await configuredAccountDiscovery(
            configService({}),
            clock,
            providerAdapters.microsoftGetCredentialType,
            providerAdapters.microsoftLogin,
            providerAdapters.mimecastLogin,
            providerAdapters.officeApps,
            () => Promise.reject(new Error(`Manifest contains ${sentinel} ${encodeURIComponent(sentinel)}`)),
        ).catch((error: unknown) => error)

        expect(error).toMatchObject({
            message: ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
            code: ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
        })
        expect(error).not.toHaveProperty('cause')
        expect(String(error)).not.toContain(sentinel)
        expect(String(error)).not.toContain(encodeURIComponent(sentinel))
    })

    it('loads the repository manifest but selects nothing for a proxy alone', async () => {
        const providerAdapters = adapters()
        const loadManifest = jest.fn().mockResolvedValue({ approvals: [] })

        await expect(
            configuredAccountDiscovery(
                configService({ CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080' }),
                clock,
                providerAdapters.microsoftGetCredentialType,
                providerAdapters.microsoftLogin,
                providerAdapters.mimecastLogin,
                providerAdapters.officeApps,
                loadManifest,
            ),
        ).resolves.toBeUndefined()
        expect(loadManifest).toHaveBeenCalledTimes(1)
    })

    it('rejects provider environment configuration when the manifest is empty', async () => {
        const providerAdapters = adapters()

        await expect(
            configuredAccountDiscovery(
                configService({
                    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                    CATCH_ALL_PROVIDER: 'office_apps',
                    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                    CATCH_ALL_PROVIDER_REGION: 'us',
                }),
                clock,
                providerAdapters.microsoftGetCredentialType,
                providerAdapters.microsoftLogin,
                providerAdapters.mimecastLogin,
                providerAdapters.officeApps,
                () => Promise.resolve({ approvals: [] }),
            ),
        ).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)
    })

    it('selects and wraps one provider for a matching approval fixture', async () => {
        const providerAdapters = adapters()

        const selected = await configuredAccountDiscovery(
            configService({
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            }),
            clock,
            providerAdapters.microsoftGetCredentialType,
            providerAdapters.microsoftLogin,
            providerAdapters.mimecastLogin,
            providerAdapters.officeApps,
            () => Promise.resolve({ approvals: [approval()] }),
        )

        expect(selected).toBeDefined()
        await expect(selected!.verify('person@example.test')).resolves.toBe(true)
        expect(providerAdapters.officeAppsVerifier.verify).toHaveBeenCalledWith('person@example.test')
    })
})
