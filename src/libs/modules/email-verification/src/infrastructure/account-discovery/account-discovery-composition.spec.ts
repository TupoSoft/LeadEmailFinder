import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    Clock,
} from '../../application/account-discovery/approved-account-discovery-verifier'
import {
    AccountDiscoveryProviderConfiguration,
    selectAccountDiscoveryVerifier,
} from '../../application/account-discovery/select-account-discovery-verifier'
import { AccountDiscoveryProviderAdapters, composeAccountDiscovery } from './account-discovery-composition'

jest.mock('../../application/account-discovery/select-account-discovery-verifier', () => {
    const actual = jest.requireActual<
        typeof import('../../application/account-discovery/select-account-discovery-verifier')
    >('../../application/account-discovery/select-account-discovery-verifier')
    return { ...actual, selectAccountDiscoveryVerifier: jest.fn(actual.selectAccountDiscoveryVerifier) }
})

const clock: Clock = { now: () => new Date('2026-09-02T10:30:00Z') }
const configuration: AccountDiscoveryProviderConfiguration = {
    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
    CATCH_ALL_PROVIDER: 'office_apps',
    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
    CATCH_ALL_PROVIDER_REGION: 'us',
}
const approval: AccountDiscoveryApprovalView = {
    id: 'approval-fixture-1',
    status: 'active',
    provider: 'office_apps',
    purpose: ACCOUNT_DISCOVERY_PURPOSE,
    region: 'us',
    effectiveAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-02T11:00:00.000Z',
}

interface FakeProviders {
    microsoftGetCredentialType: jest.Mocked<ICatchAllVerifier>
    microsoftLogin: jest.Mocked<ICatchAllVerifier>
    mimecastLogin: { forRegion: jest.Mock }
    officeApps: jest.Mocked<ICatchAllVerifier>
}

function adapters(): { providers: FakeProviders; providerAdapters: AccountDiscoveryProviderAdapters } {
    const providers: FakeProviders = {
        microsoftGetCredentialType: { sourceName: 'microsoft_4', verify: jest.fn() },
        microsoftLogin: { sourceName: 'microsoft_1', verify: jest.fn() },
        mimecastLogin: { forRegion: jest.fn() },
        officeApps: { sourceName: 'microsoft_2', verify: jest.fn().mockResolvedValue(true) },
    }

    return { providers, providerAdapters: providers as unknown as AccountDiscoveryProviderAdapters }
}

describe(composeAccountDiscovery.name, () => {
    it('composes disabled discovery without dispatching or constructing a provider', async () => {
        const { providers, providerAdapters } = adapters()
        const discovery = composeAccountDiscovery({}, [], providerAdapters, clock)

        await expect(discovery.discover('person@example.test')).resolves.toEqual([])
        expect(providers.microsoftGetCredentialType.verify).not.toHaveBeenCalled()
        expect(providers.microsoftLogin.verify).not.toHaveBeenCalled()
        expect(providers.mimecastLogin.forRegion).not.toHaveBeenCalled()
        expect(providers.officeApps.verify).not.toHaveBeenCalled()
    })

    it('composes the selected approved provider and dispatches once', async () => {
        const { providers, providerAdapters } = adapters()
        const discovery = composeAccountDiscovery(configuration, [approval], providerAdapters, clock)

        await expect(discovery.discover('person@example.test')).resolves.toEqual([{ sourceName: 'microsoft_2' }])
        expect(providers.officeApps.verify).toHaveBeenCalledTimes(1)
        expect(providers.officeApps.verify).toHaveBeenCalledWith('person@example.test')
        expect(providers.microsoftGetCredentialType.verify).not.toHaveBeenCalled()
        expect(providers.microsoftLogin.verify).not.toHaveBeenCalled()
        expect(providers.mimecastLogin.forRegion).not.toHaveBeenCalled()
    })

    it('propagates startup selection rejection without dispatching', () => {
        const { providers, providerAdapters } = adapters()

        expect(() => composeAccountDiscovery(configuration, [], providerAdapters, clock)).toThrow(
            ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
        )
        expect(providers.officeApps.verify).not.toHaveBeenCalled()
    })

    it('fails closed if selection unexpectedly returns more than one verifier', () => {
        const { providers, providerAdapters } = adapters()
        jest.mocked(selectAccountDiscoveryVerifier).mockReturnValueOnce([
            providers.officeApps,
            providers.microsoftLogin,
        ])

        expect(() => composeAccountDiscovery(configuration, [approval], providerAdapters, clock)).toThrow(
            ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
        )
        expect(providers.officeApps.verify).not.toHaveBeenCalled()
        expect(providers.microsoftLogin.verify).not.toHaveBeenCalled()
    })
})
