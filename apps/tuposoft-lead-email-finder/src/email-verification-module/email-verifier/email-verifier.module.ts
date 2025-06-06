import { Module } from '@nestjs/common'
import { SmtpModule, SmtpVerifier } from './smtp'
import { CatchAllModule, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps } from './catch-all'
import { EmailVerifier } from './email-verifier.service'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verifier.constants'
import { ICatchAllVerifier } from '../../common'

@Module({
    imports: [SmtpModule, CatchAllModule],
    providers: [
        EmailVerifier,
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
    exports: [EmailVerifier],
})
export class EmailVerifierModule {}
