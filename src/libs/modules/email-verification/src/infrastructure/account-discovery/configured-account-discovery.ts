import { ConfigService } from '@nestjs/config'
import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import { AccountDiscovery, ACCOUNT_DISCOVERY_TOKEN } from '../../application/ports/account-discovery'
import { CatchAllProxyConfiguration } from '../../domain/email-verification-configuration'
import { AccountDiscoveryApprovalView, Clock } from '../../application/account-discovery/approved-account-discovery-verifier'
import { composeAccountDiscovery } from './account-discovery-composition'

export const ACCOUNT_DISCOVERY_CLOCK_TOKEN = 'AccountDiscoveryClockToken'

export const SYSTEM_CLOCK: Clock = Object.freeze({ now: () => new Date() })

type AccountDiscoveryManifestLoader = () => Promise<{ approvals: readonly AccountDiscoveryApprovalView[] }>

export async function configuredAccountDiscovery(
    configService: ConfigService<CatchAllProxyConfiguration, true>,
    clock: Clock,
    microsoftGetCredentialType: MicrosoftGetCredentialType,
    microsoftLogin: MicrosoftLogin,
    mimecastLogin: MimecastLogin,
    officeApps: OfficeApps,
    loadManifest: AccountDiscoveryManifestLoader = loadAccountDiscoveryApprovals,
): Promise<AccountDiscovery> {
    const manifest = await loadManifest()

    return composeAccountDiscovery(
        {
            CATCH_ALL_HTTP_PROXY_URL: configService.get('CATCH_ALL_HTTP_PROXY_URL'),
            CATCH_ALL_PROVIDER: configService.get('CATCH_ALL_PROVIDER'),
            CATCH_ALL_PROVIDER_APPROVAL_ID: configService.get('CATCH_ALL_PROVIDER_APPROVAL_ID'),
            CATCH_ALL_PROVIDER_REGION: configService.get('CATCH_ALL_PROVIDER_REGION'),
        },
        manifest.approvals,
        { microsoftGetCredentialType, microsoftLogin, mimecastLogin, officeApps },
        clock,
    )
}

export { ACCOUNT_DISCOVERY_TOKEN }
