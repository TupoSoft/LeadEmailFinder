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
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '../../credits'

@Module({
    imports: [
        TypeOrmModule.forFeature([EmailVerification]),
        EmailVerifierModule,
        EmailModule,
        DomainModule,
        CreditsModule,
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
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    controllers: [SyncEmailVerificationController],
    exports: [EmailVerificationService, TypeOrmModule],
})
export class SyncEmailVerificationModule {}
