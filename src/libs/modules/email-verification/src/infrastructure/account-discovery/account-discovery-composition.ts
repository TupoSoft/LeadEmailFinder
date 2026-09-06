import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import {
    AccountDiscoveryApprovalView,
    AccountDiscoveryProviderUnavailableError,
    Clock,
} from '../../application/account-discovery/approved-account-discovery-verifier'
import {
    AccountDiscoveryProviderConfiguration,
    AccountDiscoveryVerifierFactories,
    selectAccountDiscoveryVerifier,
} from '../../application/account-discovery/select-account-discovery-verifier'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'

export interface AccountDiscoveryProviderAdapters {
    microsoftGetCredentialType: MicrosoftGetCredentialType
    microsoftLogin: MicrosoftLogin
    mimecastLogin: MimecastLogin
    officeApps: OfficeApps
}

function verifierFactories(adapters: AccountDiscoveryProviderAdapters): AccountDiscoveryVerifierFactories {
    return {
        microsoft_get_credential_type: () => adapters.microsoftGetCredentialType,
        microsoft_login: () => adapters.microsoftLogin,
        mimecast: region => {
            if (region !== 'us' && region !== 'uk') {
                throw new AccountDiscoveryProviderUnavailableError()
            }

            return adapters.mimecastLogin.forRegion(region)
        },
        office_apps: () => adapters.officeApps,
    }
}

export function composeAccountDiscoveryVerifiers(
    configuration: AccountDiscoveryProviderConfiguration,
    approvals: readonly AccountDiscoveryApprovalView[],
    adapters: AccountDiscoveryProviderAdapters,
    clock: Clock,
): ICatchAllVerifier[] {
    return selectAccountDiscoveryVerifier(configuration, approvals, verifierFactories(adapters), clock)
}
