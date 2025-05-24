import { Module } from '@nestjs/common'
import { SmtpModule, SmtpVerifier } from '../smtp-module'
import { CatchAllModule, MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps } from '../catch-all'
import {
    CATCH_ALL_VERIFIERS_TOKEN,
    DOMAIN_SERVICE_TOKEN,
    EMAIL_SERVICE_TOKEN,
    EMAIL_VERIFIER_TOKEN,
    SMTP_VERIFIER_TOKEN,
} from './email-verification.constants'
import { ICatchAllVerifier } from '../common'
import { MongooseModule } from '@nestjs/mongoose'
import { EmailVerification, EmailVerificationSchema } from './email-verification.schema'
import { EmailModule, EmailService } from '../email-module'
import { DomainModule, DomainService } from '../domain-module'
import { EmailVerifier } from './email-verifier'

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: EmailVerification.name,
                schema: EmailVerificationSchema,
            },
        ]),
        SmtpModule,
        CatchAllModule,
        EmailModule,
        DomainModule,
    ],
    providers: [
        EmailVerifier,
        {
            provide: SMTP_VERIFIER_TOKEN,
            useExisting: SmtpVerifier,
        },
        {
            provide: EMAIL_VERIFIER_TOKEN,
            useExisting: EmailVerifier,
        },
        {
            provide: CATCH_ALL_VERIFIERS_TOKEN,
            useFactory: (...catchAllVerifiers: ICatchAllVerifier[]) => catchAllVerifiers,
            inject: [MicrosoftGetCredentialType, MicrosoftLogin, MimecastLogin, OfficeApps],
        },
        {
            provide: EMAIL_SERVICE_TOKEN,
            useExisting: EmailService,
        },
        {
            provide: DOMAIN_SERVICE_TOKEN,
            useExisting: DomainService,
        },
    ],
})
export class EmailVerificationModule {}
