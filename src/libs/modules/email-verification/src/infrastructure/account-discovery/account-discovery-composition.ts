import { MicrosoftGetCredentialType } from './providers/microsoft-get-credential-type'
import { MicrosoftLogin } from './providers/microsoft-login'
import { MimecastLogin } from './providers/mimecast-login'
import { OfficeApps } from './providers/office-apps'
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
import { AccountDiscoveryService } from '../../application/account-discovery/account-discovery.service'
import { AccountDiscovery } from '../../application/ports/account-discovery'

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

export function composeAccountDiscovery(
    configuration: AccountDiscoveryProviderConfiguration,
    approvals: readonly AccountDiscoveryApprovalView[],
    adapters: AccountDiscoveryProviderAdapters,
    clock: Clock,
): AccountDiscovery {
    const verifiers = selectAccountDiscoveryVerifier(configuration, approvals, verifierFactories(adapters), clock)

    if (verifiers.length > 1) {
        throw new AccountDiscoveryProviderUnavailableError()
    }

    return new AccountDiscoveryService(verifiers[0])
}
