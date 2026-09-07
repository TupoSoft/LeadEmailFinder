import { AccountDiscoveryProvider } from './account-discovery-provider'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    AccountDiscoveryProviderName,
    Clock,
} from './approved-account-discovery-verifier'
import { AccountDiscoveryVerifierFactories, selectAccountDiscoveryVerifier } from './select-account-discovery-verifier'

const now = new Date('2026-09-02T10:30:00Z')
const clock: Clock = { now: () => now }

const approval = (overrides: Partial<AccountDiscoveryApprovalView> = {}): AccountDiscoveryApprovalView => ({
    id: 'approval-fixture-1',
    status: 'active',
    provider: 'office_apps',
    purpose: ACCOUNT_DISCOVERY_PURPOSE,
    region: 'us',
    effectiveAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-02T11:00:00.000Z',
    ...overrides,
})

function verifierFactories(): {
    factories: AccountDiscoveryVerifierFactories
    verifiers: Record<AccountDiscoveryProviderName, AccountDiscoveryProvider>
} {
    const verifiers: Record<AccountDiscoveryProviderName, AccountDiscoveryProvider> = {
        microsoft_get_credential_type: { sourceName: 'microsoft_4', verify: jest.fn() },
        microsoft_login: { sourceName: 'microsoft_1', verify: jest.fn() },
        mimecast: { sourceName: 'mimecast', verify: jest.fn() },
        office_apps: { sourceName: 'microsoft_2', verify: jest.fn() },
    }

    return {
        verifiers,
        factories: {
            microsoft_get_credential_type: jest.fn(() => verifiers.microsoft_get_credential_type),
            microsoft_login: jest.fn(() => verifiers.microsoft_login),
            mimecast: jest.fn(() => verifiers.mimecast),
            office_apps: jest.fn(() => verifiers.office_apps),
        },
    }
}

describe('selectAccountDiscoveryVerifier', () => {
    it.each([
        ['no configuration', {}],
        ['a proxy alone', { CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080' }],
    ])('selects no provider for %s', (_name, configuration) => {
        const { factories } = verifierFactories()

        expect(selectAccountDiscoveryVerifier(configuration, [], factories, clock)).toEqual([])
        expect(Object.values(factories).every(factory => jest.mocked(factory).mock.calls.length === 0)).toBe(true)
    })

    it.each([
        ['an approval without a provider', { CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1' }],
        ['a region without a provider', { CATCH_ALL_PROVIDER_REGION: 'us' }],
        ['an unknown provider', { CATCH_ALL_PROVIDER: 'unknown' }],
        ['LinkedIn', { CATCH_ALL_PROVIDER: 'linkedin' }],
        ['a provider without a proxy', { CATCH_ALL_PROVIDER: 'office_apps' }],
        [
            'a provider without an approval ID',
            {
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
        ],
        [
            'a provider without a region',
            {
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
            },
        ],
        [
            'Mimecast with an unsupported region',
            {
                CATCH_ALL_PROVIDER: 'mimecast',
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'eu',
            },
        ],
    ])('fails closed for %s', (_name, partialConfiguration) => {
        const { factories } = verifierFactories()

        expect(() => selectAccountDiscoveryVerifier(partialConfiguration, [approval()], factories, clock)).toThrow(
            ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
        )
    })

    it('rejects environment selection without matching repository approval', () => {
        const { factories } = verifierFactories()

        expect(() =>
            selectAccountDiscoveryVerifier(
                {
                    CATCH_ALL_PROVIDER: 'office_apps',
                    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                    CATCH_ALL_PROVIDER_REGION: 'us',
                },
                [],
                factories,
                clock,
            ),
        ).toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)
    })

    it('selects exactly one approved provider and binds its region', async () => {
        const { factories, verifiers } = verifierFactories()
        jest.mocked(verifiers.office_apps.verify).mockResolvedValue(true)

        const selected = selectAccountDiscoveryVerifier(
            {
                CATCH_ALL_PROVIDER: 'office_apps',
                CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                CATCH_ALL_PROVIDER_REGION: 'us',
            },
            [approval()],
            factories,
            clock,
        )

        expect(selected).toHaveLength(1)
        expect(factories.office_apps).toHaveBeenCalledWith('us')
        expect(factories.microsoft_get_credential_type).not.toHaveBeenCalled()
        expect(factories.microsoft_login).not.toHaveBeenCalled()
        expect(factories.mimecast).not.toHaveBeenCalled()
        await expect(selected[0].verify('person@example.test')).resolves.toBe(true)
    })

    it.each([
        ['approval ID', { id: 'another-approval' }],
        ['provider', { provider: 'mimecast' as const }],
        ['purpose', { purpose: 'different-purpose' as never }],
        ['region', { region: 'uk' }],
        ['status', { status: 'suspended' as const }],
        ['effective time', { effectiveAt: '2026-09-02T10:31:00.000Z' }],
        ['expiry time', { expiresAt: '2026-09-02T10:30:00.000Z' }],
    ])('rejects a mismatched %s at startup', (_name, overrides) => {
        const { factories } = verifierFactories()

        expect(() =>
            selectAccountDiscoveryVerifier(
                {
                    CATCH_ALL_PROVIDER: 'office_apps',
                    CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
                    CATCH_ALL_PROVIDER_APPROVAL_ID: 'approval-fixture-1',
                    CATCH_ALL_PROVIDER_REGION: 'us',
                },
                [approval(overrides)],
                factories,
                clock,
            ),
        ).toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)
    })
})
