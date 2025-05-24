import { Module } from '@nestjs/common'
import { SmtpModule, SmtpVerifier } from '../smtp-module'
import { CatchAllModule, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps } from '../catch-all'
import { CATCH_ALL_VERIFIERS_TOKEN, SMTP_VERIFIER_TOKEN } from './email-verification.constants'
import { ICatchAllVerifier } from '../common'
import { MongooseModule } from '@nestjs/mongoose'
import { EmailVerification, EmailVerificationSchema } from './email-verification.schema'

@Module({
    imports: [
        SmtpModule,
        CatchAllModule,
        MongooseModule.forFeature([
            {
                name: EmailVerification.name,
                schema: EmailVerificationSchema,
            },
        ]),
    ],
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
