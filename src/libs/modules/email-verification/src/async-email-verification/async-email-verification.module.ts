import { VerificationTraceModule } from '../infrastructure/verification-trace/verification-trace.module'
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AsyncEmailVerificationServiceImpl } from './async-email-verification-service-impl.service'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import { EmailVerificationOrchestrator } from '../application/email-verification.service'
import { EmailVerificationCoreModule } from '../infrastructure/email-verification-core.module'
import {
    ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
} from './async-email-verification.constants'
import { AsyncEmailVerificationController } from './async-email-verification.controller'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditsModule } from '@tuposoft/lead-email-finder/modules/credits'

@Module({
    imports: [
        VerificationTraceModule,
        EmailVerificationCoreModule,
        BullModule.registerQueue({
            name: 'async-email-verification',
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: 'async-email-verification',
                },
            },
        }),
        CreditsModule,
    ],
    providers: [
        AsyncEmailVerificationServiceImpl,
        AsyncEmailVerificationProcessor,
        {
            provide: EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: EmailVerificationOrchestrator,
        },
        {
            provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: AsyncEmailVerificationServiceImpl,
        },
        RolePermissionPolicy,
        PermissionsGuard,
    ],
    controllers: [AsyncEmailVerificationController],
})
export class AsyncEmailVerificationModule {}
