import { ConfigService } from '@nestjs/config'
import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { CatchAllProxyConfiguration } from '../email-verification-configuration'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    Clock,
} from '../application/account-discovery/approved-account-discovery-verifier'
import { configuredAccountDiscoveryVerifiers } from './email-verifier.module'

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

function configService(configuration: CatchAllProxyConfiguration): ConfigService<CatchAllProxyConfiguration, true> {
    return {
        get: jest.fn((key: keyof CatchAllProxyConfiguration) => configuration[key]),
    } as unknown as ConfigService<CatchAllProxyConfiguration, true>
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

describe(configuredAccountDiscoveryVerifiers.name, () => {
    it('loads the repository manifest but selects nothing for a proxy alone', async () => {
        const providerAdapters = adapters()
        const loadManifest = jest.fn().mockResolvedValue({ approvals: [] })

        await expect(
            configuredAccountDiscoveryVerifiers(
                configService({ CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080' }),
                clock,
                providerAdapters.microsoftGetCredentialType,
                providerAdapters.microsoftLogin,
                providerAdapters.mimecastLogin,
                providerAdapters.officeApps,
                loadManifest,
            ),
        ).resolves.toEqual([])
        expect(loadManifest).toHaveBeenCalledTimes(1)
    })

    it('rejects provider environment configuration when the manifest is empty', async () => {
        const providerAdapters = adapters()

        await expect(
            configuredAccountDiscoveryVerifiers(
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

        const selected = await configuredAccountDiscoveryVerifiers(
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

        expect(selected).toHaveLength(1)
        await expect(selected[0].verify('person@example.test')).resolves.toBe(true)
        expect(providerAdapters.officeAppsVerifier.verify).toHaveBeenCalledWith('person@example.test')
    })
})
