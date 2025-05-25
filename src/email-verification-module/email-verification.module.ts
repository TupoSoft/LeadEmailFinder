import { Module } from '@nestjs/common'
import {
    DOMAIN_SERVICE_TOKEN,
    EMAIL_SERVICE_TOKEN,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
    EMAIL_VERIFIER_TOKEN,
} from './email-verification.constants'
import { MongooseModule } from '@nestjs/mongoose'
import { EmailVerification, EmailVerificationSchema } from './email-verification.schema'
import { EmailModule, EmailService } from './email'
import { DomainModule, DomainService } from './domain'
import { EmailVerifier, EmailVerifierModule } from './email-verifier'
import { EmailVerificationService } from './email-verification.service'
import { EmailVerificationController } from './email-verification.controller'

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: EmailVerification.name,
                schema: EmailVerificationSchema,
            },
        ]),
        EmailVerifierModule,
        EmailModule,
        DomainModule,
    ],
    providers: [
        EmailVerificationService,
        {
            provide: EMAIL_VERIFIER_TOKEN,
            useExisting: EmailVerifier,
        },
        {
            provide: EMAIL_SERVICE_TOKEN,
            useExisting: EmailService,
        },
        {
            provide: DOMAIN_SERVICE_TOKEN,
            useExisting: DomainService,
        },
        {
            provide: EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: EmailVerificationService,
        },
    ],
    controllers: [EmailVerificationController],
    exports: [EmailVerificationService],
})
export class EmailVerificationModule {}
