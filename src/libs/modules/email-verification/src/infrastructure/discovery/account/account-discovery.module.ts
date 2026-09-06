import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import {
    CatchAllModule,
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import {
    AccountDiscoveryApprovalView,
    AccountDiscoveryProviderUnavailableError,
    Clock,
} from '../../../application/account-discovery/approved-account-discovery-verifier'
import { ACCOUNT_DISCOVERY, AccountDiscovery } from '../../../application/ports/account-discovery'
import { composeAccountDiscovery } from './account-discovery-composition'
import { AccountDiscoveryProviderConfiguration } from './select-account-discovery-verifier'

export const ACCOUNT_DISCOVERY_CLOCK = Symbol('ACCOUNT_DISCOVERY_CLOCK')

const SYSTEM_CLOCK: Clock = Object.freeze({ now: () => new Date() })

type AccountDiscoveryManifestLoader = () => Promise<{ approvals: readonly AccountDiscoveryApprovalView[] }>

export async function configuredAccountDiscovery(
    configService: ConfigService<AccountDiscoveryProviderConfiguration, true>,
    clock: Clock,
    microsoftGetCredentialType: MicrosoftGetCredentialType,
    microsoftLogin: MicrosoftLogin,
    mimecastLogin: MimecastLogin,
    officeApps: OfficeApps,
    loadManifest: AccountDiscoveryManifestLoader = loadAccountDiscoveryApprovals,
): Promise<AccountDiscovery | undefined> {
    try {
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
    } catch {
        throw new AccountDiscoveryProviderUnavailableError()
    }
}

@Module({
    imports: [ConfigModule, CatchAllModule],
    providers: [
        {
            provide: ACCOUNT_DISCOVERY_CLOCK,
            useValue: SYSTEM_CLOCK,
        },
        {
            provide: ACCOUNT_DISCOVERY,
            useFactory: configuredAccountDiscovery,
            inject: [
                ConfigService,
                ACCOUNT_DISCOVERY_CLOCK,
                MicrosoftGetCredentialType,
                MicrosoftLogin,
                MimecastLogin,
                OfficeApps,
            ],
        },
    ],
    exports: [ACCOUNT_DISCOVERY],
})
export class AccountDiscoveryModule {}
