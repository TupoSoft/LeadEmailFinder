import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SmtpModule, SmtpVerifier } from './smtp'
import {
    CatchAllModule,
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { EmailVerifier } from './email-verifier.service'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verifier.constants'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { CatchAllProxyConfiguration } from '../email-verification-configuration'

export function catchAllVerifiersForProxy(
    proxyUrl: string | undefined,
    catchAllVerifiers: ICatchAllVerifier[],
): ICatchAllVerifier[] {
    return proxyUrl ? catchAllVerifiers : []
}

@Module({
    imports: [ConfigModule, SmtpModule, CatchAllModule],
    providers: [
        EmailVerifier,
        {
            provide: SMTP_VERIFIER_TOKEN,
            useExisting: SmtpVerifier,
        },
        {
            provide: CATCH_ALL_VERIFIERS_TOKEN,
            useFactory: (
                configService: ConfigService<CatchAllProxyConfiguration, true>,
                ...catchAllVerifiers: ICatchAllVerifier[]
            ) => catchAllVerifiersForProxy(configService.get('CATCH_ALL_HTTP_PROXY_URL'), catchAllVerifiers),
            inject: [ConfigService, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
        },
    ],
    exports: [EmailVerifier],
})
export class EmailVerifierModule {}
