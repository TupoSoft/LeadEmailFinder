import { Module } from '@nestjs/common'
import { SmtpModule, SmtpVerifier } from '../smtp-module'
import { CatchAllModule, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps } from '../catch-all'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verification.constants'
import { ICatchAllVerifier } from '../common'

@Module({
    imports: [SmtpModule, CatchAllModule],
    providers: [
        {
            provide: SMTP_VERIFIER_TOKEN,
            useExisting: SmtpVerifier,
        },
        {
            provide: CATCH_ALL_VERIFIERS_TOKEN,
            useFactory: (...catchAllVerifiers: ICatchAllVerifier[]) => catchAllVerifiers,
            inject: [MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
        },
    ],
})
export class EmailVerificationModule {}
