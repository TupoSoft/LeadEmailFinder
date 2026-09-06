import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import {
    AccountDiscoveryApprovalView,
    AccountDiscoveryProviderName,
    AccountDiscoveryProviderUnavailableError,
    AccountDiscoverySelection,
    ApprovedAccountDiscoveryVerifier,
    Clock,
    isAccountDiscoveryApprovalAvailable,
} from './approved-account-discovery-verifier'

const ACCOUNT_DISCOVERY_PROVIDERS = new Set<AccountDiscoveryProviderName>([
    'microsoft_get_credential_type',
    'microsoft_login',
    'mimecast',
    'office_apps',
])

export interface AccountDiscoveryProviderConfiguration {
    CATCH_ALL_HTTP_PROXY_URL?: string
    CATCH_ALL_PROVIDER?: string
    CATCH_ALL_PROVIDER_APPROVAL_ID?: string
    CATCH_ALL_PROVIDER_REGION?: string
}

export type AccountDiscoveryVerifierFactories = Record<
    AccountDiscoveryProviderName,
    (region: string) => ICatchAllVerifier
>

function selectedConfiguration(
    configuration: AccountDiscoveryProviderConfiguration,
): AccountDiscoverySelection | undefined {
    const provider = configuration.CATCH_ALL_PROVIDER
    const approvalId = configuration.CATCH_ALL_PROVIDER_APPROVAL_ID
    const region = configuration.CATCH_ALL_PROVIDER_REGION

    if (provider === undefined) {
        if (approvalId !== undefined || region !== undefined) {
            throw new AccountDiscoveryProviderUnavailableError()
        }

        return undefined
    }

    if (
        !ACCOUNT_DISCOVERY_PROVIDERS.has(provider as AccountDiscoveryProviderName) ||
        configuration.CATCH_ALL_HTTP_PROXY_URL === undefined ||
        configuration.CATCH_ALL_HTTP_PROXY_URL.length === 0 ||
        approvalId === undefined ||
        approvalId.length === 0 ||
        region === undefined ||
        region.length === 0 ||
        (provider === 'mimecast' && region !== 'us' && region !== 'uk')
    ) {
        throw new AccountDiscoveryProviderUnavailableError()
    }

    return { approvalId, provider: provider as AccountDiscoveryProviderName, region }
}

export function selectAccountDiscoveryVerifier(
    configuration: AccountDiscoveryProviderConfiguration,
    approvals: readonly AccountDiscoveryApprovalView[],
    verifierFactories: AccountDiscoveryVerifierFactories,
    clock: Clock,
): ICatchAllVerifier[] {
    const selection = selectedConfiguration(configuration)

    if (!selection) {
        return []
    }

    const approval = approvals.find(candidate => candidate.id === selection.approvalId)

    if (!approval || !isAccountDiscoveryApprovalAvailable(approval, selection, clock.now())) {
        throw new AccountDiscoveryProviderUnavailableError()
    }

    const verifier = verifierFactories[selection.provider](selection.region)

    return [new ApprovedAccountDiscoveryVerifier(verifier, approval, selection, clock)]
}
