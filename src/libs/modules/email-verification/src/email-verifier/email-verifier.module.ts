import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SmtpModule } from './smtp'
import {
    CatchAllModule,
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { ACCOUNT_DISCOVERY_CLOCK_TOKEN, CATCH_ALL_VERIFIERS_TOKEN } from './email-verifier.constants'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { CatchAllProxyConfiguration } from '../email-verification-configuration'
import { loadAccountDiscoveryApprovals } from '@tuposoft/lead-email-finder/config'
import {
    AccountDiscoveryApprovalView,
    Clock,
} from '../application/account-discovery/approved-account-discovery-verifier'
import { composeAccountDiscoveryVerifiers } from '../infrastructure/account-discovery/account-discovery-composition'

const SYSTEM_CLOCK: Clock = Object.freeze({ now: () => new Date() })

type AccountDiscoveryManifestLoader = () => Promise<{ approvals: readonly AccountDiscoveryApprovalView[] }>

export async function configuredAccountDiscoveryVerifiers(
    configService: ConfigService<CatchAllProxyConfiguration, true>,
    clock: Clock,
    microsoftGetCredentialType: MicrosoftGetCredentialType,
    microsoftLogin: MicrosoftLogin,
    mimecastLogin: MimecastLogin,
    officeApps: OfficeApps,
    loadManifest: AccountDiscoveryManifestLoader = loadAccountDiscoveryApprovals,
): Promise<ICatchAllVerifier[]> {
    const manifest = await loadManifest()

    return composeAccountDiscoveryVerifiers(
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

@Module({
    imports: [ConfigModule, SmtpModule, CatchAllModule],
    providers: [
        {
            provide: ACCOUNT_DISCOVERY_CLOCK_TOKEN,
            useValue: SYSTEM_CLOCK,
        },
        {
            provide: CATCH_ALL_VERIFIERS_TOKEN,
            useFactory: configuredAccountDiscoveryVerifiers,
            inject: [
                ConfigService,
                ACCOUNT_DISCOVERY_CLOCK_TOKEN,
                MicrosoftGetCredentialType,
                MicrosoftLogin,
                MimecastLogin,
                OfficeApps,
            ],
        },
    ],
    exports: [SmtpModule, CATCH_ALL_VERIFIERS_TOKEN],
})
export class EmailVerifierModule {}
