import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AsyncEmailVerificationServiceImpl } from './async-email-verification-service-impl.service'
import { EmailVerificationProcessor } from './email-verification.processor'
import { EmailVerificationService, SyncEmailVerificationModule } from '../sync-email-verification'
import { EMAIL_VERIFICATION_SERVICE_TOKEN } from './async-email-verification.constants'

@Module({
    imports: [
        SyncEmailVerificationModule,
        BullModule.registerQueue({
            name: 'async-email-verification',
        }),
    ],
    providers: [
        AsyncEmailVerificationServiceImpl,
        EmailVerificationProcessor,
        {
            provide: EMAIL_VERIFICATION_SERVICE_TOKEN,
            useExisting: EmailVerificationService,
        },
    ],
})
export class AsyncEmailVerificationModule {}
