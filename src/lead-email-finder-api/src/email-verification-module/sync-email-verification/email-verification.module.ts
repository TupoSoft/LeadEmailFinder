import { Module } from '@nestjs/common'
import {
    DOMAIN_SERVICE_TOKEN,
    EMAIL_SERVICE_TOKEN,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
    EMAIL_VERIFIER_TOKEN,
} from './email-verification.constants'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailVerification } from './email-verification.entity'
import { EmailModule, EmailService } from '../email'
import { DomainModule, DomainService } from '../domain'
import { EmailVerifier, EmailVerifierModule } from '../email-verifier'
import { EmailVerificationService } from './email-verification.service'
import { SyncEmailVerificationController } from './sync-email-verification.controller'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [
        TypeOrmModule.forFeature([EmailVerification]),
        EmailVerifierModule,
        EmailModule,
        DomainModule,
        ApiKeyModule,
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
    controllers: [SyncEmailVerificationController],
    exports: [EmailVerificationService, TypeOrmModule],
})
export class SyncEmailVerificationModule {}
